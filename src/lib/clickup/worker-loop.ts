/**
 * O laço do worker de sincronização — spec 011, plan §2.
 *
 * Mora aqui, e não em `src/worker/clickup-sync.ts`, para poder ser testado: tudo
 * que fala com o mundo (fila, pipeline, relógio, sinal de parada) chega por
 * `WorkerLoopDeps`, no mesmo molde que `pipeline.ts` já usa com `PipelineDeps`.
 * `clickup-sync.ts` fica sendo só o bootstrap — ler env, montar o client, ligar
 * os sinais — e não tem lógica a testar.
 *
 * Não é preciosismo: o P-02 (lote reivindicado abandonado no encerramento) foi
 * um defeito de LAÇO, e passou pela revisão justamente porque não havia teste
 * possível para esta parte.
 *
 * Nada aqui escreve em log — quem loga é o bootstrap, pelos ganchos `onClaimError`
 * e `fail`. É o que mantém a regra de privacidade num só lugar (a descrição do
 * ponto é conteúdo de trabalho das pessoas e nunca vai para o log).
 */
import type { ClickUpSyncJob } from "@/db/schema";
import type { JobStage } from "./queue";

export type WorkerLoopDeps = {
  /** Reivindica até `limit` jobs prontos, marcando-os `running` (`claimJobs`). */
  claim: (limit: number) => Promise<ClickUpSyncJob[]>;
  /** Executa a máquina de estados do job (`runJob`). */
  run: (job: ClickUpSyncJob, onStage: (stage: JobStage) => void) => Promise<void>;
  /** Job concluído: `done` + registro `synced` (`completeJob`). */
  complete: (job: ClickUpSyncJob) => Promise<void>;
  /**
   * Job falhou. Recebe a etapa REALMENTE alcançada — `job.stage` é a foto da
   * reivindicação e subnotificaria o progresso no log. Nunca deve lançar.
   */
  fail: (job: ClickUpSyncJob, err: unknown, stage: JobStage) => Promise<void>;
  /** Devolve reivindicações não executadas para a fila (`releaseJobs`). */
  release: (jobIds: string[]) => Promise<void>;
  /** Sinal de encerramento gracioso — lido a cada fronteira de job. */
  shouldStop: () => boolean;
  sleep: (ms: number) => Promise<void>;
  /** Banco indisponível na reivindicação: só loga, o laço tenta no próximo ciclo. */
  onClaimError: (err: unknown) => void;
  /** Tamanho do lote reivindicado por ciclo. */
  batch: number;
  /** Espera entre ciclos quando a fila está vazia. */
  pollMs: number;
};

export async function runWorkerLoop(deps: WorkerLoopDeps): Promise<void> {
  while (!deps.shouldStop()) {
    let jobs: ClickUpSyncJob[];
    try {
      jobs = await deps.claim(deps.batch);
    } catch (err) {
      // Banco brevemente indisponível não pode derrubar o processo: espera o
      // próximo ciclo e tenta de novo. `claim` não altera nada em caso de erro
      // (a transação implícita do `update ... returning` não teria efeito),
      // então não há estado parcial a limpar aqui.
      deps.onClaimError(err);
      await deps.sleep(deps.pollMs);
      continue;
    }

    if (jobs.length === 0) {
      await deps.sleep(deps.pollMs);
      continue;
    }

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      // Encerramento gracioso, na FRONTEIRA entre jobs: aqui nenhum job está no
      // meio de uma etapa. O que não se pode fazer é interromper DENTRO de um
      // job, entre uma escrita no ClickUp e o `saveProgress` correspondente —
      // essa é a janela que causa duplicata no retry (RN-13).
      //
      // Sem esta saída, um lote de 10 jobs (3 a 7 requisições cada, no teto de
      // 90/min) pode levar ~27s e estourar a carência de parada do container,
      // levando um SIGKILL que deixa o job preso em `running`.
      if (deps.shouldStop()) {
        // P-02: o lote foi reivindicado INTEIRO por `claim`. Sair sem devolver
        // o que sobrou deixava esses pontos em "sincronizando" sem dono até a
        // retomada de 15 minutos — invisíveis para o painel do admin e para o
        // "reenviar" da pessoa. Uma escrita só, para todos os que restaram.
        await deps.release(jobs.slice(i).map((j) => j.id));
        return;
      }

      let etapaAlcancada = job.stage;
      try {
        await deps.run(job, (stage) => {
          etapaAlcancada = stage;
        });
        await deps.complete(job);
      } catch (err) {
        // Nunca derruba o laço: um job ruim não pode parar a fila.
        await deps.fail(job, err, etapaAlcancada);
      }
    }
  }
}
