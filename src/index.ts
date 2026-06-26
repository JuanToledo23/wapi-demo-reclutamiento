/**
 * Servidor Hono — Wapi Agent Bot (agente de ventas de wapi.mx) sobre Chatwoot.
 *
 * Flujo:
 *   POST /webhook → filtro anti-bucle → ACK 200 → encola por conversación
 *   Antes de llamar al agente se recupera el historial de la conversación
 *   (en memoria) para darle contexto multi-turno al LLM.
 *
 * No usa cola externa (BullMQ/Redis): basta una cadena de promesas por
 * conversación para procesar los mensajes en orden (ver `enqueue`).
 */

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { runAgent, type ConversationMessage } from "./agent.js";
import { sendMessage } from "./chatwoot.js";

const app = new Hono();

/** Delay entre mensajes cuando dividimos con |||. */
const MESSAGE_DELAY_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Historial de conversación en memoria, por conversationId.
 *
 * El token de Chatwoot es de un Agent Bot, y los Agent Bots NO pueden leer
 * mensajes vía la API (responde "not authorized for bots"). Por eso mantenemos
 * el historial nosotros: el bot ve cada mensaje entrante y genera cada
 * respuesta, así que puede reconstruir el hilo completo sin leer la API.
 *
 * Nota: es en memoria — se pierde si el proceso se reinicia. Para historial
 * persistente se necesitaría un Access Token de usuario (no de bot) y leer los
 * mensajes desde la API, o una base de datos.
 */
const conversationHistories = new Map<string, ConversationMessage[]>();
const MAX_HISTORY = 20;

function getHistory(conversationId: string | number): ConversationMessage[] {
  return conversationHistories.get(String(conversationId)) ?? [];
}

function appendHistory(
  conversationId: string | number,
  ...messages: ConversationMessage[]
): void {
  const key = String(conversationId);
  const arr = conversationHistories.get(key) ?? [];
  arr.push(...messages);
  if (arr.length > MAX_HISTORY) {
    arr.splice(0, arr.length - MAX_HISTORY);
  }
  conversationHistories.set(key, arr);
}

/**
 * Cola secuencial por conversación.
 *
 * En WhatsApp es común que el cliente mande varios mensajes seguidos. Cada uno
 * llega como un webhook distinto, así que sin esto se procesarían en paralelo,
 * todos leerían el MISMO historial viejo y el bot se contradiría (p. ej. saluda
 * dos veces). Encadenamos el procesamiento por conversationId para que cada
 * mensaje vea el resultado del anterior. Conversaciones distintas siguen en
 * paralelo.
 */
const processingChains = new Map<string, Promise<unknown>>();

export function enqueue(
  conversationId: string | number,
  task: () => Promise<void>,
): void {
  const key = String(conversationId);
  const prev = processingChains.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {}) // un error en el turno previo no debe romper la cadena
    .then(task)
    .catch((err) => {
      console.error("[queue] error procesando mensaje:", err);
    });
  processingChains.set(key, next);
  // Limpieza: si nadie encoló después, liberamos la entrada del Map.
  void next.finally(() => {
    if (processingChains.get(key) === next) {
      processingChains.delete(key);
    }
  });
}

/** Forma (parcial) del payload del Agent Bot de Chatwoot que nos importa. */
interface ChatwootWebhookPayload {
  message_type?: string;
  private?: boolean;
  content?: string;
  conversation?: {
    id?: number | string;
    meta?: { assignee?: unknown };
  };
}

/**
 * Filtro anti-bucle. True si el evento debe ignorarse en silencio.
 * Solo procesamos mensajes entrantes y públicos; cualquier otra cosa
 * (mensajes salientes del propio bot, notas privadas, eventos de actividad,
 * payloads malformados) se descarta para no entrar en bucle.
 */
export function shouldIgnoreWebhookEvent(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return true;
  const p = payload as { message_type?: unknown; private?: unknown };
  if (p.message_type !== "incoming") return true;
  if (p.private === true) return true;
  return false;
}

app.get("/", (c) => c.text("Wapi Agent Bot — wapi.mx ✅"));
app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/webhook", async (c) => {
  let payload: ChatwootWebhookPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.body(null, 200);
  }

  // Paso 1 — Filtro anti-bucle (lo PRIMERO de todo).
  if (shouldIgnoreWebhookEvent(payload)) {
    return c.body(null, 200);
  }

  // Paso 2 — ACK inmediato (200) antes de tocar el LLM.
  // Paso 3 — Procesamos en segundo plano, en orden por conversación.
  setImmediate(() => {
    enqueue(payload.conversation?.id ?? "sin-id", () =>
      processMessage(payload),
    );
  });

  return c.body(null, 200);
});

async function processMessage(
  payload: ChatwootWebhookPayload,
): Promise<void> {
  // Si ya hay un agente humano asignado, el bot calla.
  if (payload.conversation?.meta?.assignee) {
    console.log("[processMessage] humano asignado, el bot no responde");
    return;
  }

  const messageText = payload.content ?? "";
  const conversationId = payload.conversation?.id;

  if (!conversationId) {
    console.warn("[processMessage] sin conversation.id, se ignora");
    return;
  }
  if (!messageText.trim()) {
    // Mensaje entrante sin texto: casi siempre es un audio, imagen o sticker.
    // No lo ignoramos en silencio (se vería como que el bot no contesta):
    // pedimos amablemente que lo escriban.
    console.log("[processMessage] mensaje sin texto (adjunto), pido texto");
    await sendMessage(
      conversationId,
      "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me lo escribes y con gusto te ayudo?",
    ).catch((err) =>
      console.error("[processMessage] no pude pedir texto:", err),
    );
    return;
  }

  // Historial previo (no incluye el mensaje actual; runAgent lo añade).
  const history = getHistory(conversationId);

  console.log(
    `[processMessage] conv=${conversationId} histLen=${history.length} msg="${messageText}"`,
  );

  let result;
  try {
    result = await runAgent({
      conversationId,
      message: messageText,
      history,
    });
  } catch (err) {
    console.error("[processMessage] runAgent falló:", err);
    await sendMessage(
      conversationId,
      "Disculpa, tuvimos un problema técnico. Por favor intenta de nuevo en un momento.",
    ).catch(() => {});
    return;
  }

  // Si transfirió con Juan, runAgent ya envió el mensaje con el link y asignó
  // la conversación. Guardamos el turno y salimos.
  if (result.shouldTransfer) {
    appendHistory(
      conversationId,
      { role: "user", content: messageText },
      { role: "assistant", content: result.text },
    );
    return;
  }

  // Dividir la respuesta en varios mensajes si contiene |||
  const parts = result.text
    .split("|||")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Salvaguarda: si el modelo no devolvió texto, no dejamos al cliente sin
  // respuesta. Mandamos un mensaje puente y guardamos el turno.
  if (parts.length === 0) {
    const fallback =
      "Perdona, se me cruzaron los cables 🙈 ¿Me lo repites? Quiero entenderte bien para ayudarte con Wapi.";
    await sendMessage(conversationId, fallback).catch((err) =>
      console.error("[processMessage] fallback falló:", err),
    );
    appendHistory(
      conversationId,
      { role: "user", content: messageText },
      { role: "assistant", content: fallback },
    );
    return;
  }

  for (let i = 0; i < parts.length; i++) {
    await sendMessage(conversationId, parts[i]);
    if (i < parts.length - 1) {
      await sleep(MESSAGE_DELAY_MS);
    }
  }

  // Persistimos el turno completo (mensaje del cliente + respuesta del agente)
  // para tener contexto en el siguiente mensaje.
  appendHistory(
    conversationId,
    { role: "user", content: messageText },
    { role: "assistant", content: parts.join("\n") || result.text },
  );
}

// Solo arrancamos el servidor cuando se ejecuta de verdad, no al importar el
// módulo desde los tests (Vitest define process.env.VITEST).
if (!process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(
      `🚀 Wapi Agent Bot escuchando en http://localhost:${info.port}`,
    );
    console.log(`   Webhook: POST http://localhost:${info.port}/webhook`);
  });
}
