import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/agent";

describe("buildSystemPrompt — invariants", () => {
  const prompt = buildSystemPrompt();

  // Identity
  it("contains Wapi persona name", () => {
    expect(prompt).toContain("Eres Wapi");
  });
  it("contains wapi.mx domain", () => {
    expect(prompt).toContain("wapi.mx");
  });

  // Prices — must be exactly these, never others
  it("contains Esencial plan price", () => {
    expect(prompt).toContain("$1,490");
  });
  it("contains Crecimiento plan price", () => {
    expect(prompt).toContain("$2,490");
  });
  it("does NOT contain notary prices", () => {
    expect(prompt).not.toContain("Notaría");
    expect(prompt).not.toContain("expediente");
  });

  // Plan limits
  it("contains 3 usuarios for Esencial", () => {
    expect(prompt).toContain("3 usuarios");
  });
  it("contains 8 usuarios for Crecimiento", () => {
    expect(prompt).toContain("8 usuarios");
  });

  // Trial
  it("contains 14-day trial mention", () => {
    expect(prompt).toContain("14 días");
  });
  it("contains no credit card mention", () => {
    expect(prompt).toContain("sin tarjeta de crédito");
  });

  // Transfer
  it("contains Juan transfer link", () => {
    expect(prompt).toContain("wa.me/527774939562");
  });
  it("contains Juan name", () => {
    expect(prompt).toContain("Juan");
  });

  // Channels
  it("mentions WhatsApp Business", () => {
    expect(prompt).toContain("WhatsApp Business");
  });
  it("mentions Instagram", () => {
    expect(prompt).toContain("Instagram");
  });
  it("mentions Messenger", () => {
    expect(prompt).toContain("Messenger");
  });
});
