import { describe, it, expect, vi } from "vitest";
import type { ClickUpSyncJob } from "@/db/schema";
import { runWorkerLoop, type WorkerLoopDeps } from "./worker-loop";

/**
 * O laço só precisa de `id`, `entryId` e `stage`; o resto do job existe para o
 * pipeline e não influencia nenhuma decisão daqui.
 */
function job(id: string): ClickUpSyncJob {
  return {
    id,
    kind: "push_entry",
    entryId: `entry-${id}`,
    stage: "resolve",
    status: "running",
    attempts: 0,
    nextRunAt: new Date(0),
    lastError: null,
    clickupTaskId: null,
    clickupCommentId: null,
    clickupTimeEntryId: null,
    moveToReview: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/** Deps com tudo neutro — cada teste sobrescreve só o que lhe interessa. */
function deps(over: Partial<WorkerLoopDeps> = {}): WorkerLoopDeps {
  return {
    batch: 10,
    pollMs: 5000,
    claim: vi.fn(async () => []),
    run: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    shouldStop: vi.fn(() => true),
    sleep: vi.fn(async () => {}),
    onClaimError: vi.fn(),
    ...over,
  };
}

describe("runWorkerLoop", () => {
  it("processa o lote reivindicado e conclui cada job", async () => {
    let ciclos = 0;
    const d = deps({
      claim: vi.fn(async () => (ciclos++ === 0 ? [job("a"), job("b")] : [])),
      shouldStop: vi.fn(() => ciclos > 1),
    });

    await runWorkerLoop(d);

    expect(d.run).toHaveBeenCalledTimes(2);
    expect(d.complete).toHaveBeenCalledTimes(2);
    expect(d.release).not.toHaveBeenCalled();
    expect(d.fail).not.toHaveBeenCalled();
  });

  /**
   * P-02. `claim` marca o lote INTEIRO como `running` de uma vez, então sair no
   * meio dele sem devolver o resto deixava esses pontos em "sincronizando" sem
   * dono até a retomada de 15 minutos de `claimJobs` — invisíveis para o painel
   * do admin e recusados pelo "reenviar" da pessoa. O sintoma era rotineiro: um
   * `docker compose restart worker` com fila cheia bastava.
   */
  it("devolve para a fila o que sobrou do lote quando encerra no meio", async () => {
    let parando = false;
    const d = deps({
      claim: vi.fn(async () => [job("a"), job("b"), job("c")]),
      // SIGTERM chega durante o primeiro job — o `break` acontece na fronteira
      // seguinte, com dois jobs ainda reivindicados e não executados.
      run: vi.fn(async () => {
        parando = true;
      }),
      shouldStop: vi.fn(() => parando),
    });

    await runWorkerLoop(d);

    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledExactlyOnceWith(["b", "c"]);
  });

  it("não devolve nada quando o encerramento cai na fronteira do lote", async () => {
    let parando = false;
    const d = deps({
      claim: vi.fn(async () => [job("a")]),
      run: vi.fn(async () => {
        parando = true;
      }),
      shouldStop: vi.fn(() => parando),
    });

    await runWorkerLoop(d);

    expect(d.complete).toHaveBeenCalledTimes(1);
    // O único job do lote rodou até o fim: não há reivindicação órfã, e chamar
    // `release` aqui reagendaria um job que já está `done`.
    expect(d.release).not.toHaveBeenCalled();
  });

  it("um job ruim não para a fila", async () => {
    let ciclos = 0;
    const erro = new Error("boom");
    const d = deps({
      claim: vi.fn(async () => (ciclos++ === 0 ? [job("a"), job("b")] : [])),
      shouldStop: vi.fn(() => ciclos > 1),
      run: vi.fn(async (j) => {
        if (j.id === "a") throw erro;
      }),
    });

    await runWorkerLoop(d);

    expect(d.fail).toHaveBeenCalledTimes(1);
    expect(d.fail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a" }),
      erro,
      "resolve",
    );
    // O segundo job rodou e concluiu — a falha do primeiro não interrompeu o lote.
    expect(d.complete).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "b" }),
    );
  });

  it("reporta a etapa REALMENTE alcançada na falha, não a da reivindicação", async () => {
    let ciclos = 0;
    const d = deps({
      claim: vi.fn(async () => (ciclos++ === 0 ? [job("a")] : [])),
      shouldStop: vi.fn(() => ciclos > 1),
      run: vi.fn(async (_j, onStage) => {
        onStage("comment");
        onStage("time_entry");
        throw new Error("morreu tarde");
      }),
    });

    await runWorkerLoop(d);

    expect(d.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "time_entry",
    );
  });

  it("banco indisponível na reivindicação não derruba o laço", async () => {
    let ciclos = 0;
    const d = deps({
      claim: vi.fn(async () => {
        if (ciclos++ === 0) throw new Error("banco fora");
        return [];
      }),
      shouldStop: vi.fn(() => ciclos > 1),
    });

    await runWorkerLoop(d);

    expect(d.onClaimError).toHaveBeenCalledTimes(1);
    expect(d.sleep).toHaveBeenCalledWith(5000);
  });

  it("fila vazia dorme o intervalo de polling", async () => {
    let ciclos = 0;
    const d = deps({
      claim: vi.fn(async () => {
        ciclos++;
        return [];
      }),
      shouldStop: vi.fn(() => ciclos > 0),
    });

    await runWorkerLoop(d);

    expect(d.sleep).toHaveBeenCalledExactlyOnceWith(5000);
  });
});
