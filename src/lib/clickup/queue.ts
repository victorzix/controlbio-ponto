import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { clickupJobStage, clickupSyncJobs, registrosPonto } from "@/db/schema";
import type { ClickUpSyncJob } from "@/db/schema";
import { ClickUpError, computeBackoffMs } from "./errors";

/** Etapa da máquina de estados do pipeline — espelha `clickupJobStage` do schema. */
export type JobStage = (typeof clickupJobStage.enumValues)[number];

/**
 * Tipo da transação recebida pelas funções que precisam nascer/gravar junto com
 * outra operação (ex.: o ponto). Derivado do próprio `db.transaction` para não
 * duplicar os generics internos do Drizzle. `import type` — não puxa `@/db` em
 * runtime, só o tipo (ver `getDb` abaixo).
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Import adiado do client do banco (`@/db` lança se `DATABASE_URL` não estiver
 * definida — ver `src/db/index.ts`). Este módulo também exporta `planRetry`,
 * a única função testada sem banco (`queue.test.ts`); importar `db` estático
 * no topo do arquivo obrigaria até esse teste puro a ter `DATABASE_URL`
 * definida só para conseguir importar o módulo.
 */
async function getDb(): Promise<typeof db> {
  return (await import("@/db")).db;
}

/**
 * Enfileira o job de sincronização do registro recém-criado.
 *
 * Recebe a **transação** do chamador (não `db`) de propósito: o job precisa
 * nascer junto com o ponto (plan.md §2). Se o processo caísse entre salvar o
 * ponto e gravar o job em transações separadas, um crash no meio perderia a
 * sincronização silenciosamente, sem deixar rastro.
 */
export async function enqueuePushEntry(
  tx: Transaction,
  input: {
    entryId: string;
    kind: "push_entry" | "correction";
    moveToReview?: boolean;
  },
): Promise<void> {
  await tx.insert(clickupSyncJobs).values({
    kind: input.kind,
    entryId: input.entryId,
    moveToReview: input.moveToReview ?? false,
  });
}

/**
 * Reivindica jobs prontos. `FOR UPDATE SKIP LOCKED` é o que permite mais de um
 * worker sem processar o mesmo job duas vezes — e o que impede um worker travado
 * de bloquear a fila inteira atrás dele.
 *
 * Também **retoma job preso em `running`** há mais de 15 minutos. Um worker
 * morto sem chance de encerrar (SIGKILL depois da carência do Docker, OOM,
 * reinício da máquina) deixa o job marcado `running` para sempre: ninguém mais
 * o reivindica (`pending`), o contador do admin não o enxerga (`failed`) e o
 * "reenviar" da pessoa não o encontra — o ponto fica "sincronizando" eterno e
 * só SQL na mão resolve. Isso contraria spec §8 ("o envio precisa sobreviver a
 * reinício da aplicação").
 *
 * Retomar é seguro **por construção**: o job guarda a etapa alcançada (`stage`)
 * e os ids já criados no ClickUp, então ele recomeça de onde parou, nunca do
 * início (RN-13). O `updated_at` usado como relógio é gravado por esta própria
 * função a cada reivindicação — não precisa de coluna nova.
 *
 * 15 minutos é folga larga sobre o job mais caro (7 requisições no teto de
 * 90/min) e sobre a carência de parada do container (`stop_grace_period`).
 */
export async function claimJobs(limit: number): Promise<ClickUpSyncJob[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    update clickup_sync_jobs
       set status = 'running', updated_at = now()
     where id in (
       select id from clickup_sync_jobs
        where (
                status = 'pending'
                or (status = 'running' and updated_at < now() - interval '15 minutes')
              )
          and next_run_at <= now()
        order by next_run_at
        for update skip locked
        limit ${limit}
     )
    returning *
  `);
  // `db.execute` com SQL cru devolve as colunas como o Postgres as nomeia
  // (snake_case) — não passa pelo mapeamento camelCase do query builder do
  // Drizzle. Mapeamos explicitamente para não devolver um objeto com o shape
  // errado disfarçado de `ClickUpSyncJob`.
  return (rows as unknown as RawJobRow[]).map(mapJobRow);
}

/** Formato cru de uma linha de `clickup_sync_jobs` como o driver a devolve. */
type RawJobRow = {
  id: string;
  kind: ClickUpSyncJob["kind"];
  entry_id: string;
  stage: JobStage;
  status: ClickUpSyncJob["status"];
  attempts: number;
  next_run_at: Date;
  last_error: string | null;
  clickup_task_id: string | null;
  clickup_comment_id: string | null;
  clickup_time_entry_id: string | null;
  move_to_review: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapJobRow(row: RawJobRow): ClickUpSyncJob {
  return {
    id: row.id,
    kind: row.kind,
    entryId: row.entry_id,
    stage: row.stage,
    status: row.status,
    attempts: row.attempts,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
    clickupTaskId: row.clickup_task_id,
    clickupCommentId: row.clickup_comment_id,
    clickupTimeEntryId: row.clickup_time_entry_id,
    moveToReview: row.move_to_review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Grava o progresso do job antes de seguir para a próxima etapa — é o que dá
 * idempotência a um retry (RN-13): ele retoma da etapa gravada, nunca do início.
 * Só sobrescreve os campos de progresso que vieram no patch.
 */
export async function advanceStage(
  jobId: string,
  patch: {
    stage: JobStage;
    clickupTaskId?: string;
    clickupCommentId?: string;
    clickupTimeEntryId?: string;
  },
): Promise<void> {
  const db = await getDb();
  await db
    .update(clickupSyncJobs)
    .set({
      stage: patch.stage,
      ...(patch.clickupTaskId !== undefined
        ? { clickupTaskId: patch.clickupTaskId }
        : {}),
      ...(patch.clickupCommentId !== undefined
        ? { clickupCommentId: patch.clickupCommentId }
        : {}),
      ...(patch.clickupTimeEntryId !== undefined
        ? { clickupTimeEntryId: patch.clickupTimeEntryId }
        : {}),
    })
    .where(eq(clickupSyncJobs.id, jobId));
}

/**
 * Marca o job como concluído e o registro de ponto como sincronizado — na mesma
 * transação, para nunca deixar um job "done" com o ponto ainda "pending" (ou
 * vice-versa) caso o processo caia entre as duas gravações.
 */
export async function completeJob(
  jobId: string,
  entryId: string,
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(clickupSyncJobs)
      .set({ status: "done", stage: "done" })
      .where(eq(clickupSyncJobs.id, jobId));

    await tx
      .update(registrosPonto)
      .set({ clickupSyncStatus: "synced" })
      .where(eq(registrosPonto.id, entryId));
  });
}

/**
 * Decide o que fazer com um job que falhou — spec 011, design §5.2.
 *
 * Pura de propósito: é a regra que mais dá bug (contar tentativa a mais, insistir
 * em erro terminal, ignorar o reset do 429) e a que mais barato se testa isolada.
 */
export function planRetry(input: {
  error: ClickUpError;
  attempts: number;
  maxAttempts: number;
  now: Date;
}): { status: "pending" | "failed"; nextRunAt: Date; attempts: number } {
  const { error, attempts, maxAttempts, now } = input;

  if (!error.retryable) {
    return { status: "failed", nextRunAt: now, attempts };
  }

  // Limite de requisições não é culpa do job: espera até o reset e não gasta
  // tentativa — ser barrado pelo rate limit não é o mesmo que falhar.
  if (error.code === "RATE_LIMIT" && error.resetAt) {
    return { status: "pending", nextRunAt: error.resetAt, attempts };
  }

  const next = attempts + 1;
  if (next > maxAttempts) {
    return { status: "failed", nextRunAt: now, attempts };
  }
  return {
    status: "pending",
    nextRunAt: new Date(now.getTime() + computeBackoffMs(attempts)),
    attempts: next,
  };
}

/**
 * Aplica `planRetry` ao job e grava o erro. NUNCA deixa exceção escapar: se nem
 * conseguíssemos registrar a falha, o job ficaria travado em `running` para
 * sempre (foi marcado assim por `claimJobs`) — melhor logar e deixar o worker
 * tentar de novo depois do que propagar o erro.
 *
 * Quando `planRetry` decide que a falha é **definitiva** (`status: "failed"`),
 * o próprio registro de ponto também vira `clickupSyncStatus: "failed"` — na
 * MESMA transação do job, igual a `completeJob` — para nunca deixar o job
 * `failed` com o ponto ainda dizendo `pending` se o processo cair entre as
 * duas escritas (CA-11, RF-13: é o que faz o card mostrar o estado de falha
 * e oferecer o reenvio). Um retry com backoff (`status: "pending"`) ainda
 * está em voo — o registro continua `pending`, não vira `failed` a cada
 * tentativa transitória.
 */
export async function failJob(
  jobId: string,
  err: ClickUpError,
  maxAttempts: number,
): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ attempts: clickupSyncJobs.attempts, entryId: clickupSyncJobs.entryId })
      .from(clickupSyncJobs)
      .where(eq(clickupSyncJobs.id, jobId))
      .limit(1);
    const job = rows[0];
    const attempts = job?.attempts ?? 0;

    const plan = planRetry({ error: err, attempts, maxAttempts, now: new Date() });

    await db.transaction(async (tx) => {
      await tx
        .update(clickupSyncJobs)
        .set({
          status: plan.status,
          nextRunAt: plan.nextRunAt,
          attempts: plan.attempts,
          lastError: err.message,
        })
        .where(eq(clickupSyncJobs.id, jobId));

      if (plan.status === "failed" && job?.entryId) {
        await tx
          .update(registrosPonto)
          .set({ clickupSyncStatus: "failed" })
          .where(eq(registrosPonto.id, job.entryId));
      }
    });
  } catch (e) {
    console.error("clickup: falha ao registrar failJob do job", jobId, e);
  }
}

/**
 * Reenvia manualmente um job `failed` para a fila. Mantém o `stage` atual
 * de propósito: o retry retoma de onde o job parou, não refaz etapas já
 * concluídas (RN-13).
 *
 * Também volta o registro de ponto para `clickupSyncStatus: "pending"` — na
 * MESMA transação — porque é verdade imediata (o trabalho está na fila de
 * novo) e é o que tira o card do estado "falhou" assim que a pessoa clica em
 * "reenviar" (RF-14), sem depender do worker rodar para o card deixar de
 * mentir.
 */
export async function retryJob(jobId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(clickupSyncJobs)
      .set({
        status: "pending",
        attempts: 0,
        nextRunAt: new Date(),
      })
      .where(eq(clickupSyncJobs.id, jobId))
      .returning({ entryId: clickupSyncJobs.entryId });

    const entryId = updated[0]?.entryId;
    if (entryId) {
      await tx
        .update(registrosPonto)
        .set({ clickupSyncStatus: "pending" })
        .where(eq(registrosPonto.id, entryId));
    }
  });
}

/** Total de jobs em `failed` — alimenta o alerta/painel do admin (RF-14). */
export async function countFailedJobs(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clickupSyncJobs)
    .where(eq(clickupSyncJobs.status, "failed"));

  return rows[0]?.count ?? 0;
}
