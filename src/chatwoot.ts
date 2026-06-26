/**
 * Cliente mínimo para la API de Chatwoot.
 * Lo necesario para el Agent Bot: enviar mensajes, asignar a un humano y
 * leer el historial de una conversación.
 *
 * El account id se lee de CHATWOOT_ACCOUNT_ID, así que las funciones reciben
 * solo el conversationId.
 */

import type { ChatwootMessage } from "./agent.js";

const BASE_URL = process.env.CHATWOOT_BASE_URL ?? "https://app.chatwoot.com";

function accountId(): string {
  const id = process.env.CHATWOOT_ACCOUNT_ID;
  if (!id) {
    throw new Error("CHATWOOT_ACCOUNT_ID no está configurado");
  }
  return id;
}

function apiToken(): string {
  const token = process.env.CHATWOOT_API_TOKEN;
  if (!token) {
    throw new Error("CHATWOOT_API_TOKEN no está configurado");
  }
  return token;
}

/**
 * Envía un mensaje saliente (visible para el cliente) a una conversación.
 */
export async function sendMessage(
  conversationId: string | number,
  content: string,
): Promise<void> {
  const url = `${BASE_URL}/api/v1/accounts/${accountId()}/conversations/${conversationId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiToken(),
    },
    body: JSON.stringify({
      content,
      message_type: "outgoing",
      private: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[chatwoot] sendMessage falló (${res.status}): ${body}`);
    throw new Error(`Chatwoot sendMessage ${res.status}`);
  }
}

/**
 * Asigna la conversación al agente humano configurado (CHATWOOT_HUMAN_AGENT_ID).
 * No envía ningún mensaje: el aviso al cliente (link de Juan) lo manda el agente
 * antes de llamar a esta función.
 */
export async function assignToHuman(
  conversationId: string | number,
): Promise<void> {
  const agentId = process.env.CHATWOOT_HUMAN_AGENT_ID;
  if (!agentId) {
    throw new Error("CHATWOOT_HUMAN_AGENT_ID no está configurado");
  }

  const url = `${BASE_URL}/api/v1/accounts/${accountId()}/conversations/${conversationId}/assignments`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiToken(),
    },
    body: JSON.stringify({
      assignee_id: parseInt(agentId, 10),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[chatwoot] assignToHuman falló (${res.status}): ${body}`);
    throw new Error(`Chatwoot assignToHuman ${res.status}`);
  }
}

/**
 * Lee los mensajes de una conversación para reconstruir el historial.
 * Devuelve los mensajes crudos de Chatwoot (el mapeo a {role, content} lo hace
 * mapChatwootMessages en agent.ts). Best-effort: ante un error devuelve [].
 */
export async function getConversationMessages(
  conversationId: string | number,
): Promise<ChatwootMessage[]> {
  const url = `${BASE_URL}/api/v1/accounts/${accountId()}/conversations/${conversationId}/messages`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiToken(),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[chatwoot] getConversationMessages falló (${res.status}): ${body}`,
    );
    return [];
  }

  const data = (await res.json().catch(() => null)) as {
    payload?: ChatwootMessage[];
  } | null;

  return data?.payload ?? [];
}
