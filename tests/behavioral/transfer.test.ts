import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the AI SDK so no real API call is made. We keep `tool` and `stepCountIs`
// real (agent.ts builds the tool at module load) and only stub generateText.
vi.mock("ai", async (importActual) => {
  const actual = await importActual<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

// Mock Chatwoot client
vi.mock("../../src/chatwoot", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  assignToHuman: vi.fn().mockResolvedValue(undefined),
  getConversationMessages: vi.fn().mockResolvedValue([]),
}));

import { generateText } from "ai";
import { sendMessage, assignToHuman } from "../../src/chatwoot";
import { runAgent } from "../../src/agent";

describe("transfer_to_juan flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends wa.me link when transfer_to_juan tool fires", async () => {
    // Simulate LLM deciding to call transfer_to_juan
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: "transfer_to_juan", args: {} }],
      text: "",
    } as any);

    await runAgent({
      conversationId: "conv-123",
      message: "quiero contratar",
      history: [
        { role: "user", content: "tengo un restaurante" },
        { role: "assistant", content: "cuántas personas atienden mensajes?" },
      ],
    });

    // Must send the transfer message with the wa.me link
    expect(sendMessage).toHaveBeenCalledWith(
      "conv-123",
      expect.stringContaining("wa.me/527774939562"),
    );
  });

  it("calls assignToHuman when transfer fires", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [{ toolName: "transfer_to_juan", args: {} }],
      text: "",
    } as any);

    await runAgent({
      conversationId: "conv-123",
      message: "¿cómo pago?",
      history: [],
    });

    expect(assignToHuman).toHaveBeenCalledWith("conv-123");
  });

  it("does NOT call assignToHuman when no transfer fires", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [],
      text: "Cuéntame, ¿qué tipo de negocio tienes?",
    } as any);

    await runAgent({
      conversationId: "conv-123",
      message: "hola",
      history: [],
    });

    expect(assignToHuman).not.toHaveBeenCalled();
  });
});
