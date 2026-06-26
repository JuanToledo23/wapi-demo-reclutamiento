import { describe, it, expect } from "vitest";
import { enqueue } from "../../src/index";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enqueue — per-conversation sequencing", () => {
  it("runs tasks for the SAME conversation strictly in order", async () => {
    const order: string[] = [];
    const task = (id: string, delay: number) => () =>
      new Promise<void>((resolve) => {
        order.push(`start-${id}`);
        setTimeout(() => {
          order.push(`end-${id}`);
          resolve();
        }, delay);
      });

    // Primero un task lento, luego uno rápido: aun así debe terminar el 1 antes
    // de empezar el 2 (sin esto, el rápido adelantaría al lento → contradicción).
    enqueue("conv-A", task("1", 30));
    enqueue("conv-A", task("2", 1));

    await sleep(80);

    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("runs DIFFERENT conversations concurrently", async () => {
    const order: string[] = [];
    const task = (id: string, delay: number) => () =>
      new Promise<void>((resolve) => {
        order.push(`start-${id}`);
        setTimeout(() => {
          order.push(`end-${id}`);
          resolve();
        }, delay);
      });

    enqueue("conv-X", task("X", 30));
    enqueue("conv-Y", task("Y", 30));

    // Ambas deben arrancar antes de que cualquiera termine.
    await sleep(10);
    expect(order).toEqual(["start-X", "start-Y"]);

    await sleep(60);
    expect(order).toContain("end-X");
    expect(order).toContain("end-Y");
  });

  it("a failing task does NOT break the chain for later messages", async () => {
    const order: string[] = [];

    enqueue("conv-B", () => Promise.reject(new Error("boom")));
    enqueue("conv-B", () => {
      order.push("ran-after-failure");
      return Promise.resolve();
    });

    await sleep(40);
    expect(order).toEqual(["ran-after-failure"]);
  });
});
