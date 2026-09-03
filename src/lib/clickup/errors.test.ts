import { describe, it, expect } from "vitest";
import { classifyHttp, computeBackoffMs, BACKOFF_STEPS_MS } from "./errors";

describe("classifyHttp", () => {
  it("429 é recuperável e carrega o horário de liberação", () => {
    const reset = new Date("2026-09-02T10:00:00Z");
    const err = classifyHttp(429, "", reset);
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.retryable).toBe(true);
    expect(err.resetAt).toEqual(reset);
  });

  it("5xx é recuperável", () => {
    expect(classifyHttp(500, "boom", null).retryable).toBe(true);
    expect(classifyHttp(503, "", null).code).toBe("INDISPONIVEL");
  });

  it("401 e 403 são terminais", () => {
    expect(classifyHttp(401, "", null).code).toBe("TOKEN_INVALIDO");
    expect(classifyHttp(401, "", null).retryable).toBe(false);
    expect(classifyHttp(403, "", null).retryable).toBe(false);
  });

  it("404 vira TAREFA_SUMIU e é recuperável (limpa o índice e recria)", () => {
    const err = classifyHttp(404, "", null);
    expect(err.code).toBe("TAREFA_SUMIU");
    expect(err.retryable).toBe(true);
  });

  it("404 diz QUAL recurso não foi achado", () => {
    // Nem todo 404 é tarefa sumida: um folderId errado na configuração dá 404
    // em /v2/folder/{id}/list e, sem o caminho, o admin recebe "recurso não
    // encontrado" apontando para o lugar errado.
    const err = classifyHttp(404, "", null, "/v2/folder/999/list");
    expect(err.message).toContain("/v2/folder/999/list");
  });

  it("400 é terminal e preserva o corpo para diagnóstico", () => {
    const err = classifyHttp(400, '{"err":"Status not found"}', null);
    expect(err.code).toBe("REQUISICAO_INVALIDA");
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("Status not found");
  });
});

describe("computeBackoffMs", () => {
  it("cresce a cada tentativa", () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_STEPS_MS[0]);
    expect(computeBackoffMs(1)).toBe(BACKOFF_STEPS_MS[1]);
    expect(computeBackoffMs(0)).toBeLessThan(computeBackoffMs(3));
  });

  it("satura no último degrau em vez de estourar", () => {
    const ultimo = BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1];
    expect(computeBackoffMs(99)).toBe(ultimo);
  });

  it("primeiro degrau é 1 minuto e último é 6 horas", () => {
    expect(BACKOFF_STEPS_MS[0]).toBe(60_000);
    expect(BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1]).toBe(6 * 60 * 60_000);
  });
});
