import { describe, it, expect } from "vitest";
import { planRetry } from "./queue";
import { ClickUpError } from "./errors";

const recuperavel = new ClickUpError({
  code: "INDISPONIVEL", message: "boom", retryable: true,
});
const terminal = new ClickUpError({
  code: "TOKEN_INVALIDO", message: "token", retryable: false,
});

describe("planRetry", () => {
  it("reagenda erro recuperável com backoff crescente", () => {
    const p = planRetry({ error: recuperavel, attempts: 0, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("pending");
    expect(p.nextRunAt.getTime()).toBe(60_000);
    expect(p.attempts).toBe(1);
  });

  it("desiste ao atingir o teto de tentativas", () => {
    const p = planRetry({ error: recuperavel, attempts: 5, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("failed");
  });

  it("erro terminal falha na hora, sem gastar tentativas", () => {
    const p = planRetry({ error: terminal, attempts: 0, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("failed");
  });

  it("429 espera até o reset e NÃO conta tentativa", () => {
    const reset = new Date(120_000);
    const err = new ClickUpError({
      code: "RATE_LIMIT", message: "limite", retryable: true, resetAt: reset,
    });
    const p = planRetry({ error: err, attempts: 2, maxAttempts: 5, now: new Date(0) });
    expect(p.status).toBe("pending");
    expect(p.nextRunAt).toEqual(reset);
    expect(p.attempts).toBe(2);
  });
});
