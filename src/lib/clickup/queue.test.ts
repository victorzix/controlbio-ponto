import { describe, it, expect, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimJobs, planRetry } from "./queue";
import { ClickUpError } from "./errors";

/**
 * `queue.ts` importa `@/db` de forma adiada (`getDb`) justamente para os testes
 * puros rodarem sem `DATABASE_URL`. Aqui trocamos esse módulo por um duplo que
 * só grava o que foi executado — o suficiente para inspecionar o SQL montado.
 */
const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn<(query: SQL) => Promise<unknown[]>>(async () => []),
}));
vi.mock("@/db", () => ({ db: { execute: executeMock } }));

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

/**
 * `claimJobs` monta SQL cru (`db.execute`) porque precisa de
 * `FOR UPDATE SKIP LOCKED`, que o query builder não expressa. Sem banco no
 * ambiente de teste, o que dá para verificar — e o que de fato importa — é a
 * CLÁUSULA gerada: se ela voltar a olhar só para `pending`, todo job que ficou
 * preso em `running` (worker morto por SIGKILL/OOM/reinício da máquina) some da
 * fila para sempre — invisível para o contador do admin e para o "reenviar" da
 * pessoa, recuperável só por SQL na mão.
 */
describe("claimJobs", () => {
  it("reivindica também o job preso em running (worker morto no meio)", async () => {
    executeMock.mockClear();
    await claimJobs(10);

    const query = new PgDialect().sqlToQuery(executeMock.mock.calls[0][0]);
    const sqlText = query.sql.replace(/\s+/g, " ");

    expect(sqlText).toContain("status = 'pending'");
    expect(sqlText).toContain("status = 'running'");
    expect(sqlText).toContain("interval '15 minutes'");
    expect(sqlText).toContain("next_run_at <= now()");
  });
});
