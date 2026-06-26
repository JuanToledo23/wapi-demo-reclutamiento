# Wapi Agent Bot — wapi.mx

Microservicio independiente que conecta un **Agent Bot de Chatwoot** con
**Wapi**, el agente de ventas de IA de [wapi.mx](https://wapi.mx).

Wapi atiende leads por WhatsApp (e Instagram/Messenger vía Chatwoot): entiende
el negocio del lead, resuelve dudas sobre la plataforma con información exacta,
maneja objeciones y, cuando detecta interés real (o una pregunta que no puede
responder con certeza), **transfiere la conversación con Juan Toledo**, fundador
de Wapi — enviando el link directo de WhatsApp y asignando la conversación a un
humano en Chatwoot.

El agente recibe el **historial de la conversación** en cada turno, así que
mantiene contexto multi-turno (clave para flujos de venta: objeción → rebatir →
cierre).

## Stack
- Node.js + TypeScript
- Hono.js (HTTP)
- AI SDK (`ai` + `@ai-sdk/openai`) con `gpt-4o-mini`
- Procesamiento async con `setImmediate` (sin BullMQ/Redis/Supabase)
- Vitest (unit + behavioral + smoke)

## Estructura
```
src/
  index.ts     → servidor Hono, POST /webhook (filtro anti-bucle + ACK + async)
                 + lectura de historial antes de invocar al agente
  chatwoot.ts  → cliente API Chatwoot (sendMessage, assignToHuman,
                 getConversationMessages)
  agent.ts     → LLM + system prompt de Wapi + tool transfer_to_juan
                 + helpers puros (buildSystemPrompt, isFirstMessage,
                 mapChatwootMessages)
tests/
  unit/        → prompt, history, filter (sin red, <1s)
  behavioral/  → flujo de transferencia con el LLM mockeado
  smoke/       → escenarios contra OpenAI real (se corren manualmente)
```

## Cómo funciona
1. Chatwoot envía un webhook del Agent Bot a `POST /webhook`.
2. Se filtran eventos que no son mensajes entrantes y públicos (anti-bucle).
3. Se responde `200` de inmediato y se procesa en segundo plano.
4. Se lee el historial de la conversación (`getConversationMessages`) y se
   mapea a `{role, content}`.
5. Se invoca al agente con el historial + el mensaje actual.
6. Si el agente decide transferir, envía el mensaje con el link de Juan
   (`https://wa.me/527774939562`) y asigna la conversación a un humano.
   Si no, responde normal (dividiendo en varios mensajes si usa `|||`).

Mientras haya un agente humano asignado a la conversación, el bot guarda
silencio.

## Correr en local
```bash
npm install
cp .env.example .env   # y rellena los valores
npm run dev            # tsx watch, http://localhost:3000
```

`POST /webhook` recibe el payload del Agent Bot de Chatwoot.
`GET /health` para health checks.

## Variables de entorno (.env)
| Variable | Descripción |
|---|---|
| `CHATWOOT_BASE_URL` | URL de tu Chatwoot (ej. `https://app.chatwoot.com`) |
| `CHATWOOT_ACCOUNT_ID` | ID numérico de la cuenta (lo ves en la URL del dashboard) |
| `CHATWOOT_API_TOKEN` | Access token de un agente/bot con permisos |
| `CHATWOOT_HUMAN_AGENT_ID` | ID del agente humano (Juan) al que se transfiere |
| `OPENAI_API_KEY` | API key de OpenAI |
| `PORT` | Puerto del servidor (opcional, default 3000) |

## Configurar el webhook en Chatwoot
1. Crea un **Agent Bot** en Chatwoot (Settings → Agent Bots) y copia su
   access token a `CHATWOOT_API_TOKEN`.
2. Configura la URL del webhook del bot apuntando a tu despliegue:
   `https://TU-DOMINIO/webhook`.
3. Asigna el Agent Bot a la bandeja (inbox) de WhatsApp.
4. Define `CHATWOOT_HUMAN_AGENT_ID` con el ID del agente humano (Juan) que
   recibirá las conversaciones transferidas.

El bot solo procesa mensajes **entrantes y públicos**; ignora sus propios
mensajes salientes, notas privadas y eventos de actividad para no entrar en
bucle.

## Tests
```bash
npm test            # unit + behavioral (sin costo, <1s, correr siempre)
npm run test:watch  # modo watch
npm run test:smoke  # escenarios con OpenAI real (~$0.01, antes de cada deploy)
npm run test:coverage
```

- **unit** (`tests/unit/`): invariantes del system prompt (precios, links,
  límites de plan), mapeo de historial y filtro anti-bucle.
- **behavioral** (`tests/behavioral/`): flujo de `transfer_to_juan` con el LLM
  y el cliente de Chatwoot mockeados — verifica que se envía el link de Juan y
  se asigna a un humano.
- **smoke** (`tests/smoke/`): llaman a OpenAI de verdad (cuestan dinero y tardan
  ~5s c/u). Requieren `OPENAI_API_KEY`. Están **excluidas** de `npm test` y se
  corren manualmente con `npm run test:smoke` antes de un deploy a producción.

## Notas del demo
- Sin memoria propia: el contexto multi-turno se reconstruye leyendo el
  historial de la conversación desde la API de Chatwoot en cada mensaje.
- Los precios y planes del system prompt (Esencial $1,490 / Crecimiento $2,490
  MXN/mes) son los únicos válidos — el agente tiene instrucción explícita de no
  inventar otros.
