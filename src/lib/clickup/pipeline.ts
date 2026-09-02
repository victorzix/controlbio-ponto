/**
 * Máquina de estados do envio de um ponto ao ClickUp — spec 011, design §4.
 *
 * ```
 * resolve ──► comment ──► time_entry ──► finish ──► done
 * ```
 *
 * A regra que sustenta tudo: cada etapa **grava o progresso depois** da chamada
 * ao ClickUp e **antes** de a próxima começar (`saveProgress`). É só isso que
 * impede um retry de criar a tarefa duas vezes, comentar duas vezes ou lançar o
 * tempo duas vezes (**RN-13**) — a API do ClickUp não tem chave de idempotência.
 *
 * Módulo puro de I/O próprio: tudo que fala com o mundo (ClickUp, banco) chega
 * por `PipelineDeps`, o que deixa cada ramo testável com `vi.fn()`.
 *
 * Nada aqui escreve em log: a descrição do ponto é conteúdo de trabalho das
 * pessoas (RNF de privacidade) e não pode vazar para o log do servidor.
 */

import type { ClickUpSyncJob } from "@/db/schema";
import { formatWorkedMinutes, type Project } from "@/lib/ponto/validation";
import { brasiliaInstant } from "@/lib/tz";
import type {
  ClickUpClient,
  ClickUpTask,
  CommentPart,
  UpdateTaskInput,
} from "./client";
import type { ProjectConfig } from "./config";
import { ClickUpError } from "./errors";
import type { deleteTaskLink, findTaskLink, upsertTaskLink } from "./links";
import type { JobStage } from "./queue";
import { pickSprintList } from "./sprint";
import { classifyStatus, shouldMoveToInProgress } from "./status";
import { normalizeTitle } from "./title";

/** Tipo do job — `push_entry` (envio) ou `correction` (ponto editado, RN-06). */
export type JobKind = ClickUpSyncJob["kind"];

/** O ponto e o que o pipeline precisa saber de quem o lançou. */
export type PipelineEntry = {
  id: string;
  userId: string;
  clickupUserId: number | null;
  title: string;
  workDate: string;
  workedMinutes: number;
  description: string;
  project: Project;
};

/** Progresso gravado ao fim de cada etapa (ver `advanceStage` em `queue.ts`). */
export type StagePatch = {
  stage: JobStage;
  clickupTaskId?: string;
  clickupCommentId?: string;
  clickupTimeEntryId?: string;
};

export type PipelineDeps = {
  client: ClickUpClient;
  getConfig: (project: Project) => Promise<ProjectConfig | null>;
  findLink: typeof findTaskLink;
  upsertLink: typeof upsertTaskLink;
  deleteLink: typeof deleteTaskLink;
  loadEntry: (entryId: string) => Promise<PipelineEntry | null>;
  saveProgress: (jobId: string, patch: StagePatch) => Promise<void>;
  personalToken: (userId: string) => Promise<string | null>;
};

/**
 * Hora (em Brasília) usada como início do lançamento de tempo. O ponto registra
 * **duração**, não horário (spec 003) — então ancoramos no começo do expediente.
 */
const HORA_INICIO_EXPEDIENTE = 9;

const MS_POR_MINUTO = 60_000;

/** "2026-06-25" → "25/06/2026", sem `new Date` (que sofreria com o fuso). */
function formatDateBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Corpo do comentário — duas partes: cabeçalho em **negrito de verdade** (a API
 * não interpreta markdown, design §4) e a descrição como bloco de texto cru.
 * Nada de asterisco: quem dá o negrito é o atributo.
 */
export function buildCommentBody(
  entry: PipelineEntry,
  kind: JobKind,
): CommentPart[] {
  const cabecalho = `${formatDateBR(entry.workDate)} · ${formatWorkedMinutes(
    entry.workedMinutes,
  )}`;

  return [
    {
      // RN-06: a edição vira uma correção nova, sem reescrever o original.
      text: kind === "correction" ? `Correção · ${cabecalho}` : cabecalho,
      attributes: { bold: true },
    },
    { text: `\n\n${entry.description}` },
  ];
}

/**
 * Etapa `resolve`: devolve o id da tarefa que vai receber o ponto, criando,
 * adotando ou reaproveitando conforme o caso. Deixa o índice
 * `(projeto, título normalizado)` apontando para ela (RN-01).
 */
async function resolveTask(
  entry: PipelineEntry,
  config: ProjectConfig,
  assignee: number,
  deps: PipelineDeps,
): Promise<string> {
  const tituloNormalizado = normalizeTitle(entry.title);

  const lists = await deps.client.getLists(config.folderId);
  const destino = pickSprintList(
    lists,
    entry.workDate,
    config.sprintDateFormat,
    config.backlogListId,
  ).listId;

  // 1. Índice local — o caminho comum, sem gastar requisição de busca.
  const link = await deps.findLink(entry.project, tituloNormalizado);
  if (link) {
    if (link.sprintListId !== destino) {
      // Carry over (RF-17): a atividade continua, a tarefa acompanha a sprint.
      await deps.client.moveTaskToList(link.clickupTaskId, destino);
      await deps.upsertLink({
        project: entry.project,
        normalizedTitle: tituloNormalizado,
        clickupTaskId: link.clickupTaskId,
        clickupTaskUrl: link.clickupTaskUrl,
        sprintListId: destino,
      });
    }

    // O índice é por atividade, não por pessoa: quem lançou este ponto pode
    // ainda não ser responsável (RF-04). `add` só acrescenta, então repetir é
    // inofensivo. O status NÃO é tocado aqui — sem reler a tarefa não sabemos
    // se ela está parada, e na dúvida não se mexe no board (RN-02).
    await deps.client.updateTask(link.clickupTaskId, { addAssignees: [assignee] });
    return link.clickupTaskId;
  }

  // 2. Busca no ClickUp — a tarefa pode ter nascido no planejamento da sprint.
  const listIds = lists.map((l) => l.id);
  if (!listIds.includes(config.backlogListId)) listIds.push(config.backlogListId);
  const encontradas = await deps.client.findTasksInLists(listIds);

  // RN-03: tarefa concluída encerra a identidade — não é reaproveitada nem
  // movida; o ponto começa uma tarefa nova.
  const existente: ClickUpTask | undefined = encontradas.find(
    (t) =>
      normalizeTitle(t.name) === tituloNormalizado &&
      classifyStatus(t.statusType) !== "concluido",
  );

  if (existente) {
    if (existente.listId !== destino) {
      await deps.client.moveTaskToList(existente.id, destino);
    }

    const patch: UpdateTaskInput = {};
    // RN-02: só quem está parado vai para andamento. Nunca regredimos.
    if (shouldMoveToInProgress(existente.statusType)) {
      patch.status = config.inProgressStatus;
    }
    if (!existente.assigneeIds.includes(assignee)) {
      patch.addAssignees = [assignee];
    }
    if (Object.keys(patch).length > 0) {
      await deps.client.updateTask(existente.id, patch);
    }

    await deps.upsertLink({
      project: entry.project,
      normalizedTitle: tituloNormalizado,
      clickupTaskId: existente.id,
      clickupTaskUrl: existente.url,
      sprintListId: destino,
    });
    return existente.id;
  }

  // 3. Cria. Nunca escreve estimativa de tempo (RN-10) — `CreateTaskInput` nem
  // oferece o campo.
  const nova = await deps.client.createTask(destino, {
    name: entry.title,
    markdownDescription: entry.description,
    status: config.inProgressStatus,
    assignees: [assignee],
  });

  // Reaponta o índice para a tarefa nova (design §2.3) — no caso do RN-03, a
  // concluída deixa de ser referenciada e continua intacta no ClickUp.
  await deps.upsertLink({
    project: entry.project,
    normalizedTitle: tituloNormalizado,
    clickupTaskId: nova.id,
    clickupTaskUrl: nova.url,
    sprintListId: destino,
  });
  return nova.id;
}

/**
 * A tarefa tem que existir a partir da etapa `comment`: o mesmo `saveProgress`
 * que avançou o stage gravou o `clickupTaskId`. Não ter os dois é estado
 * inconsistente — insistir só queimaria tentativa.
 */
function requireTaskId(taskId: string | null, stage: JobStage): string {
  if (!taskId) {
    throw new ClickUpError({
      code: "DESCONHECIDO",
      message: `Job na etapa "${stage}" sem tarefa registrada.`,
      retryable: false,
    });
  }
  return taskId;
}

async function runStages(
  job: ClickUpSyncJob,
  entry: PipelineEntry,
  config: ProjectConfig,
  assignee: number,
  deps: PipelineDeps,
): Promise<void> {
  let stage: JobStage = job.stage;
  let taskId = job.clickupTaskId;

  if (stage === "resolve") {
    taskId = await resolveTask(entry, config, assignee, deps);
    await deps.saveProgress(job.id, { stage: "comment", clickupTaskId: taskId });
    stage = "comment";
  }

  if (stage === "done") return;

  const tarefa = requireTaskId(taskId, stage);

  if (stage === "comment") {
    const commentId = await deps.client.createComment(
      tarefa,
      buildCommentBody(entry, job.kind),
    );
    await deps.saveProgress(job.id, {
      stage: "time_entry",
      clickupCommentId: commentId,
    });
    stage = "time_entry";
  }

  if (stage === "time_entry") {
    const token = await deps.personalToken(entry.userId);
    if (token) {
      const timeEntryId = await deps.client.createTimeEntry(
        {
          taskId: tarefa,
          startMs: brasiliaInstant(entry.workDate, HORA_INICIO_EXPEDIENTE).getTime(),
          durationMs: entry.workedMinutes * MS_POR_MINUTO,
          description: entry.title,
        },
        token,
      );
      await deps.saveProgress(job.id, {
        stage: "finish",
        clickupTimeEntryId: timeEntryId,
      });
    } else {
      // RN-12: conta pessoal é opcional — sem token, pula sem erro nenhum.
      await deps.saveProgress(job.id, { stage: "finish" });
    }
    stage = "finish";
  }

  if (stage === "finish") {
    // RF-09: só quem encerrou o cronômetro pedindo revisão move a tarefa — e só
    // se o projeto tiver status de conclusão configurado.
    if (job.moveToReview && config.doneStatus) {
      await deps.client.updateTask(tarefa, { status: config.doneStatus });
    }
    await deps.saveProgress(job.id, { stage: "done" });
  }
}

/**
 * A tarefa do índice não existe mais no ClickUp (404). Esquece o vínculo e volta
 * o job para o começo, para a próxima tentativa recriar (design §5.2).
 */
async function esquecerIndiceSeTarefaSumiu(
  err: unknown,
  job: ClickUpSyncJob,
  entry: PipelineEntry,
  deps: PipelineDeps,
): Promise<void> {
  if (!(err instanceof ClickUpError) || err.code !== "TAREFA_SUMIU") return;

  try {
    await deps.deleteLink(entry.project, normalizeTitle(entry.title));
    await deps.saveProgress(job.id, { stage: "resolve" });
  } catch {
    // Limpeza é o melhor esforço: o erro que importa é o original, relançado
    // logo abaixo, e é ele que a fila precisa classificar.
  }
}

/**
 * Executa um job da fila. Retoma da etapa gravada — nunca do começo (RN-13).
 *
 * Exceções sobem para o chamador (o worker), que decide entre reagendar com
 * backoff e marcar `failed` (`planRetry`, `queue.ts`).
 */
export async function runJob(
  job: ClickUpSyncJob,
  deps: PipelineDeps,
): Promise<void> {
  const entry = await deps.loadEntry(job.entryId);
  // Ponto excluído no meio do caminho (RN-07): nada a fazer, e nada a desfazer
  // no ClickUp.
  if (!entry) return;

  // RN-08: projeto sem configuração — ou com a integração desligada — não envia
  // nada. Terminal: insistir não resolve, o admin é que precisa agir.
  const config = await deps.getConfig(entry.project);
  if (!config) {
    throw new ClickUpError({
      code: "CONFIG_AUSENTE",
      message: `Projeto "${entry.project}" sem configuração ativa do ClickUp.`,
      retryable: false,
    });
  }

  // RN-09: sem vínculo com um membro, a tarefa nasceria sem responsável e
  // poluiria o board dos outros. Também terminal.
  const assignee = entry.clickupUserId;
  if (assignee === null) {
    throw new ClickUpError({
      code: "SEM_VINCULO",
      message: "Usuário sem vínculo com um membro do ClickUp.",
      retryable: false,
    });
  }

  try {
    await runStages(job, entry, config, assignee, deps);
  } catch (err) {
    await esquecerIndiceSeTarefaSumiu(err, job, entry, deps);
    throw err;
  }
}
