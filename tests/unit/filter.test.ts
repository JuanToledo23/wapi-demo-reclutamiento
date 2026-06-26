import { describe, it, expect } from "vitest";
import { shouldIgnoreWebhookEvent } from "../../src/index";

describe("shouldIgnoreWebhookEvent", () => {
  it("passes through public incoming messages", () => {
    const payload = { message_type: "incoming", private: false };
    expect(shouldIgnoreWebhookEvent(payload)).toBe(false);
  });
  it("drops outgoing messages (anti-loop)", () => {
    const payload = { message_type: "outgoing", private: false };
    expect(shouldIgnoreWebhookEvent(payload)).toBe(true);
  });
  it("drops private messages", () => {
    const payload = { message_type: "incoming", private: true };
    expect(shouldIgnoreWebhookEvent(payload)).toBe(true);
  });
  it("drops activity events", () => {
    const payload = { message_type: "activity", private: false };
    expect(shouldIgnoreWebhookEvent(payload)).toBe(true);
  });
  it("drops malformed payloads", () => {
    expect(shouldIgnoreWebhookEvent(null)).toBe(true);
    expect(shouldIgnoreWebhookEvent({})).toBe(true);
    expect(shouldIgnoreWebhookEvent("string")).toBe(true);
  });
});
