import { describe, it, expect, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimJobs, planEntryEdit, planRetry, releaseJobs } from "./queue";
import { ClickUpError } from "./errors";

/**
 * `queue.ts` importa `@/db` de forma adiada (`getDb`) justamente para os testes
 * puros rodarem sem `DATABASE_URL`. Aqui trocamos esse módulo por um duplo que
 * só grava o que foi executado — o suficiente para inspecionar o SQL montado.
 */
const { executeMock, updateSetMock, updateWhereMock } = vi.hoisted(() => {
  const updateWhereMock = vi.fn<(where: SQL) => Promise<unknown[]>>(
    async () => [],
  );
  return {
    executeMock: vi.fn<(query: SQL) => Promise<unknown[]>>(async () => []),
    updateWhereMock,
    updateSetMock: vi.fn<
      (values: Record<string, unknown>) => { where: typeof updateWhereMock }
    >(() => ({ where: updateWhereMock })),
  };
});
vi.mock("@/db", () => ({
  db: {
    execute: executeMock,
    update: () => ({ set: updateSetMock }),
  },
}));

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

/**
 * P-02 — o lote é reivindicado INTEIRO por `claimJobs`, então o que não rodar
 * antes do encerramento tem de voltar para `pending`. O laço que decide QUANDO
 * chamar isto está coberto em `worker-loop.test.ts`; aqui interessa a cláusula.
 */
describe("releaseJobs", () => {
  it("não vai ao banco quando não sobrou reivindicação", async () => {
    updateSetMock.mockClear();
    await releaseJobs([]);
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("devolve para `pending` apenas as linhas ainda em `running`", async () => {
    updateSetMock.mockClear();
    updateWhereMock.mockClear();

    await releaseJobs(["job-a", "job-b"]);

    expect(updateSetMock).toHaveBeenCalledWith({ status: "pending" });

    const query = new PgDialect().sqlToQuery(updateWhereMock.mock.calls[0][0]);
    const sqlText = query.sql.replace(/\s+/g, " ");
    expect(sqlText).toContain(" in (");
    expect(sqlText).toContain('"status" =');
    // O `running` na cláusula é o que impede roubar de volta uma linha que a
    // retomada de 15 minutos (ou outro worker) já reivindicou.
    expect(query.params).toEqual(["job-a", "job-b", "running"]);
  });

  it("engole o erro — roda no encerramento, sem próximo ciclo para tentar", async () => {
    updateWhereMock.mockRejectedValueOnce(new Error("banco fora"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(releaseJobs(["job-a"])).resolves.toBeUndefined();

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

/**
 * P-01 e P-03 — a regra de "ponto editado". Pura pelo mesmo motivo de
 * `planRetry`: é a decisão que dobra horas da pessoa no ClickUp quando erra.
 */
describe("planEntryEdit", () => {
  const job = (
    status: "pending" | "running" | "done" | "failed",
    clickupCommentId: string | null,
  ) => ({ id: "job-1", status, clickupCommentId } as const);

  it("registro sem job nenhum: insere o primeiro envio", () => {
    // Ponto que nasceu antes da 011 (ou com a integração desligada) e agora foi
    // editado com ela ligada — não há linha para reaproveitar.
    expect(planEntryEdit(undefined)).toEqual({ action: "insert" });
  });

  it("job em execução: não mexe na linha de outro processo", () => {
    expect(planEntryEdit(job("running", null))).toEqual({ action: "skip" });
  });

  it("envio ainda em voo: reaproveita a linha e RETOMA de onde parou", () => {
    // P-03 (caso menor): antes isto inseria um segundo job — dois comentários e
    // dois lançamentos de tempo no mesmo ponto. E `resetStage: false` porque o
    // job releria o ponto já editado de todo jeito (RN-13).
    expect(planEntryEdit(job("pending", null))).toEqual({
      action: "reuse",
      jobId: "job-1",
      kind: "push_entry",
      resetStage: false,
    });
  });

  it("falhou antes de comentar: segue sendo o primeiro envio", () => {
    // Morreu no `resolve`/`comment`: nada chegou ao ClickUp, então o tempo AINDA
    // NÃO foi lançado e uma `correction` (que pula o lançamento por definição)
    // deixaria o ponto para sempre sem hora lá.
    expect(planEntryEdit(job("failed", null))).toMatchObject({
      kind: "push_entry",
      resetStage: false,
    });
  });

  it("já sincronizado: a edição vira correção (RN-06)", () => {
    expect(planEntryEdit(job("done", "c-1"))).toEqual({
      action: "reuse",
      jobId: "job-1",
      kind: "correction",
      // A correção precisa percorrer as etapas de novo para gerar o comentário
      // novo — sem isto o job estaria em `done` e `runJob` sairia na hora.
      resetStage: true,
    });
  });

  /**
   * P-01, o item mais grave da revisão: `failJob` marca o ponto como `failed`
   * seja qual for o estado anterior, então uma correção que falha em definitivo
   * fazia um ponto JÁ ENTREGUE parecer nunca enviado. A edição seguinte
   * enfileirava um `push_entry`, que roda o estágio de tempo outra vez e infla
   * as horas da pessoa no ClickUp — efeito externo irreversível.
   */
  it("correção que falhou em definitivo continua correção — não relança tempo", () => {
    expect(planEntryEdit(job("failed", "c-1"))).toMatchObject({
      kind: "correction",
      resetStage: true,
    });
  });
});
