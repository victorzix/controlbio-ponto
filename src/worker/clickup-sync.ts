/**
 * Worker de sincronização com o ClickUp — spec 011, plan §2.
 *
 * Roda em CONTAINER PRÓPRIO (estágio `tools` do Dockerfile, que já tem tsx e o
 * código-fonte) — não dentro do processo do Next.js, porque um laço lá dentro
 * morreria junto com a app a cada deploy/restart, disputaria CPU com as
 * requisições HTTP e duplicaria o consumo da fila no dia em que a app rodar
 * com duas réplicas.
 *
 * É de propósito BURRO — **bootstrap e nada mais**: lê o ambiente, monta o
 * client, liga os sinais e entrega tudo a `runWorkerLoop`. A regra de negócio do
 * ClickUp vive em `src/lib/clickup/pipeline.ts` e o laço da fila em
 * `src/lib/clickup/worker-loop.ts` (lá dá para testar; aqui não). Se este
 * arquivo cresce um `if` sobre COMPORTAMENTO — do ClickUp ou da fila — ele está
 * no lugar errado.
 *
 * Log: só id de job, etapa e código de erro. NUNCA o token (de app ou
 * pessoal) nem a descrição do ponto — é conteúdo de trabalho das pessoas
 * (RNF de privacidade, mesma regra do pipeline).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto, users } from "@/db/schema";
import { createClickUpClient } from "@/lib/clickup/client";
import { getProjectConfig } from "@/lib/clickup/config";
import { decryptToken } from "@/lib/clickup/crypto";
import { ClickUpError } from "@/lib/clickup/errors";
import { deleteTaskLink, findTaskLink, upsertTaskLink } from "@/lib/clickup/links";
import { runJob, type PipelineDeps, type PipelineEntry } from "@/lib/clickup/pipeline";
import {
  advanceStage,
  claimJobs,
  completeJob,
  failJob,
  releaseJobs,
} from "@/lib/clickup/queue";
import type { SprintPick } from "@/lib/clickup/sprint";
import { runWorkerLoop } from "@/lib/clickup/worker-loop";

const POLL_MS = Number(process.env.CLICKUP_WORKER_POLL_MS ?? 5000);
const MAX_ATTEMPTS = Number(process.env.CLICKUP_MAX_ATTEMPTS ?? 5);
/** Tamanho do lote reivindicado por ciclo — fixo, não é um RNF configurável. */
const BATCH = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `loadEntry` do `PipelineDeps`: o pipeline só enxerga o formato `PipelineEntry`
 * — junta ponto e usuário aqui porque `clickupUserId` (o assignee, RN-09) vive
 * no cadastro de quem lançou o ponto, não no registro em si.
 */
async function loadEntry(entryId: string): Promise<PipelineEntry | null> {
  const rows = await db
    .select({
      id: registrosPonto.id,
      userId: registrosPonto.userId,
      clickupUserId: users.clickupUserId,
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      project: registrosPonto.project,
    })
    .from(registrosPonto)
    .innerJoin(users, eq(registrosPonto.userId, users.id))
    .where(eq(registrosPonto.id, entryId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * `saveEntryTask` do `PipelineDeps`: grava no próprio ponto a tarefa resolvida
 * (design §4.6, RF-13) e como o destino foi decidido (`sprintSource` — RF-07,
 * CA-21), o que dá ao card do ponto o aviso de "sincronizado sem sprint"
 * quando caiu no backlog. Sobrescrita das mesmas colunas — repetir num retry
 * é inofensivo, por isso não precisa de guarda alguma.
 */
async function saveEntryTask(
  entryId: string,
  taskId: string,
  taskUrl: string,
  sprintSource: SprintPick["source"],
): Promise<void> {
  await db
    .update(registrosPonto)
    .set({
      clickupTaskId: taskId,
      clickupTaskUrl: taskUrl,
      clickupSprintSource: sprintSource,
    })
    .where(eq(registrosPonto.id, entryId));
}

/**
 * `personalToken` do `PipelineDeps`: decifra o token pessoal do usuário
 * (RN-12). Sem chave de cifra, sem token guardado, ou token que falha ao
 * decifrar (chave rotacionada, dado corrompido) — todos os três casos
 * devolvem `null` em vez de derrubar o job: o pipeline trata `null` como
 * "sem conta pessoal conectada" e só pula o lançamento de tempo.
 */
async function personalToken(userId: string): Promise<string | null> {
  const key = process.env.CLICKUP_TOKEN_ENC_KEY;
  if (!key) return null;

  const rows = await db
    .select({ clickupTokenEnc: users.clickupTokenEnc })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const enc = rows[0]?.clickupTokenEnc;
  if (!enc) return null;

  try {
    return decryptToken(enc, key);
  } catch {
    // Nunca logar o payload cifrado nem o erro de decifragem — pode conter
    // fragmento do texto em claro. Só o fato de ter falhado.
    console.error(
      `[clickup-worker] token pessoal do usuario ${userId} nao pode ser decifrado; pulando lancamento de tempo.`,
    );
    return null;
  }
}

/**
 * `runJob` lança tanto `ClickUpError` (do client/pipeline) quanto exceções
 * genéricas (bug, driver do banco, etc.) — `failJob` só sabe classificar a
 * primeira. Uma exceção genérica vira erro DESCONHECIDO e RETRYABLE: uma
 * falha transitória (ex.: banco brevemente inacessível no meio do job) merece
 * uma nova tentativa com backoff, não um `failed` definitivo.
 */
function toClickUpError(err: unknown): ClickUpError {
  if (err instanceof ClickUpError) return err;
  return new ClickUpError({
    code: "DESCONHECIDO",
    message: err instanceof Error ? err.message : "Erro desconhecido no worker.",
    retryable: true,
  });
}

/** Sinaliza para o laço principal encerrar após o lote em andamento. */
let parando = false;
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    console.log(`[clickup-worker] ${sinal} recebido, encerrando apos o lote atual.`);
    parando = true;
  });
}

async function main(): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) {
    // Estado normal de um ambiente sem a integração configurada (RN-08 no
    // nível do processo, não só do projeto): não há credencial de app nenhuma,
    // então não há nada a reivindicar. Loga e sai — não fica em loop à toa.
    console.log(
      "[clickup-worker] sem CLICKUP_API_TOKEN/CLICKUP_TEAM_ID — nada a fazer.",
    );
    return;
  }

  const client = createClickUpClient({
    token,
    teamId,
    perMinute: Number(process.env.CLICKUP_RATE_LIMIT_PER_MIN ?? 90),
  });

  const deps: PipelineDeps = {
    client,
    getConfig: getProjectConfig,
    findLink: findTaskLink,
    upsertLink: upsertTaskLink,
    deleteLink: deleteTaskLink,
    loadEntry,
    saveProgress: advanceStage,
    saveEntryTask,
    personalToken,
  };

  console.log("[clickup-worker] iniciado.");

  await runWorkerLoop({
    batch: BATCH,
    pollMs: POLL_MS,
    shouldStop: () => parando,
    sleep,
    claim: claimJobs,
    run: (job, onStage) => runJob(job, deps, onStage),
    complete: (job) => completeJob(job.id, job.entryId),
    release: releaseJobs,
    onClaimError: (err) =>
      console.error(
        "[clickup-worker] falha ao reivindicar jobs (banco indisponivel?), tentando no proximo ciclo.",
        err instanceof Error ? err.message : err,
      ),
    fail: async (job, err, stage) => {
      // `failJob` por si só nunca lança (ver `queue.ts`).
      const clickUpErr = toClickUpError(err);
      console.error(
        `[clickup-worker] job ${job.id} falhou na etapa "${stage}" (codigo ${clickUpErr.code}).`,
      );
      await failJob(job.id, clickUpErr, MAX_ATTEMPTS);
    },
  });

  console.log("[clickup-worker] encerrado.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[clickup-worker] falha fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
