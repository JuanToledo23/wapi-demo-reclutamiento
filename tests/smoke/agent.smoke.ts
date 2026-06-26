import { describe, it, expect } from "vitest";
import { generateAgentReply } from "../../src/agent";

// These tests call OpenAI for real. They cost real money and take ~5s each.
// Run before every production deploy: npm run test:smoke
// Requires OPENAI_API_KEY in the environment.

describe.concurrent("Wapi agent behavior — smoke tests", () => {
  it("first message returns the correct greeting", async () => {
    const reply = await runAgentGetReply({
      message: "hola",
      history: [],
    });
    expect(reply.toLowerCase()).toContain("soy wapi");
    expect(reply).toContain("¿qué tipo de negocio tienes?");
  }, 15000);

  it("stays in topic — refuses off-topic questions", async () => {
    const reply = await runAgentGetReply({
      message: "¿quién ganó el mundial 2022?",
      history: [
        { role: "user", content: "tengo una clínica" },
        {
          role: "assistant",
          content: "entiendo, cuéntame más sobre tu clínica",
        },
      ],
    });
    expect(reply.toLowerCase()).not.toContain("mundial");
    expect(reply.toLowerCase()).not.toContain("qatar");
    // Should redirect back to Wapi
    expect(
      reply.toLowerCase().includes("wapi") ||
        reply.toLowerCase().includes("solo puedo"),
    ).toBe(true);
  }, 15000);

  it("mentions the correct Esencial plan price", async () => {
    const reply = await runAgentGetReply({
      message: "¿cuánto cuesta?",
      history: [
        { role: "user", content: "tengo un restaurante" },
        {
          role: "assistant",
          content: "cuéntame, ¿cuántas personas atienden mensajes?",
        },
        { role: "user", content: "somos 2 personas" },
      ],
    });
    expect(reply).toContain("$1,490");
  }, 15000);

  it("does NOT invent prices", async () => {
    const reply = await runAgentGetReply({
      message: "¿cuánto cuesta?",
      history: [],
    });
    // Should not contain prices other than the two real ones
    const hasWrongPrice =
      /\$[0-9,]+/.test(reply) &&
      !reply.includes("$1,490") &&
      !reply.includes("$2,490");
    expect(hasWrongPrice).toBe(false);
  }, 15000);

  it("handles \"está caro\" without mentioning price first", async () => {
    const reply = await runAgentGetReply({
      message: "está caro",
      history: [
        { role: "user", content: "tengo un salón de belleza" },
        { role: "assistant", content: "el plan Esencial cuesta $1,490 al mes" },
      ],
    });
    // Should ask why they feel it's expensive, not just repeat price
    const asksWhy =
      reply.toLowerCase().includes("por qué") ||
      reply.toLowerCase().includes("qué sientes") ||
      reply.toLowerCase().includes("en relación");
    expect(asksWhy).toBe(true);
  }, 15000);
});

// Helper: runs the agent (pure, no Chatwoot side effects) and returns the
// text reply. Uses generateAgentReply, which returns the transfer message
// verbatim if the model decides to transfer.
async function runAgentGetReply(args: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const { text } = await generateAgentReply(args);
  return text;
}
