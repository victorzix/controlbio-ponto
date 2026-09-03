import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

/** Relógio e sono falsos: o teste não pode esperar de verdade. */
function harness(perMinute: number) {
  let now = 0;
  const slept: number[] = [];
  const limiter = createRateLimiter({
    perMinute,
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
  });
  return { limiter, slept, advance: (ms: number) => { now += ms; } };
}

describe("createRateLimiter", () => {
  it("deixa passar até o limite sem esperar", async () => {
    const { limiter, slept } = harness(3);
    await limiter.take();
    await limiter.take();
    await limiter.take();
    expect(slept).toEqual([]);
  });

  it("espera quando o balde esvazia", async () => {
    const { limiter, slept } = harness(2);
    await limiter.take();
    await limiter.take();
    await limiter.take();
    expect(slept.length).toBe(1);
    expect(slept[0]).toBeGreaterThan(0);
  });

  it("reabastece com o passar do tempo", async () => {
    const { limiter, slept, advance } = harness(2);
    await limiter.take();
    await limiter.take();
    advance(60_000);
    await limiter.take();
    expect(slept).toEqual([]);
  });

  it("encolhe o balde quando o ClickUp diz que sobrou pouco", async () => {
    const { limiter, slept } = harness(100);
    limiter.observe({ remaining: 0, resetAt: new Date(30_000) });
    await limiter.take();
    expect(slept.length).toBe(1);
  });

  it("nunca espera com resetAt no passado", async () => {
    const { limiter, slept } = harness(100);
    limiter.observe({ remaining: 0, resetAt: new Date(-5_000) });
    await limiter.take();
    expect(slept).toEqual([]);
  });
});
