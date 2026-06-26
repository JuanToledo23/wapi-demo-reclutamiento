import { describe, it, expect } from "vitest";
import { isFirstMessage, mapChatwootMessages } from "../../src/agent";

describe("isFirstMessage", () => {
  it("returns true when history is empty", () => {
    expect(isFirstMessage([])).toBe(true);
  });
  it("returns false when history has prior messages", () => {
    const history = [
      { role: "user" as const, content: "hola" },
      { role: "assistant" as const, content: "hola soy wapi" },
    ];
    expect(isFirstMessage(history)).toBe(false);
  });
});

describe("mapChatwootMessages", () => {
  it("maps incoming messages to role user", () => {
    const msgs = [{ message_type: "incoming", content: "hola", private: false }];
    const result = mapChatwootMessages(msgs);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("hola");
  });
  it("maps outgoing messages to role assistant", () => {
    const msgs = [
      { message_type: "outgoing", content: "hola soy wapi", private: false },
    ];
    const result = mapChatwootMessages(msgs);
    expect(result[0].role).toBe("assistant");
  });
  it("excludes private messages", () => {
    const msgs = [
      { message_type: "incoming", content: "nota interna", private: true },
    ];
    expect(mapChatwootMessages(msgs)).toHaveLength(0);
  });
  it("excludes activity messages", () => {
    const msgs = [
      { message_type: "activity", content: "assigned to agent", private: false },
    ];
    expect(mapChatwootMessages(msgs)).toHaveLength(0);
  });
  it("returns at most 20 messages", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      message_type: "incoming",
      content: `msg ${i}`,
      private: false,
    }));
    expect(mapChatwootMessages(msgs)).toHaveLength(20);
  });
  it("preserves chronological order", () => {
    const msgs = [
      { message_type: "incoming", content: "primero", private: false },
      { message_type: "outgoing", content: "segundo", private: false },
      { message_type: "incoming", content: "tercero", private: false },
    ];
    const result = mapChatwootMessages(msgs);
    expect(result.map((m) => m.content)).toEqual([
      "primero",
      "segundo",
      "tercero",
    ]);
  });
});
