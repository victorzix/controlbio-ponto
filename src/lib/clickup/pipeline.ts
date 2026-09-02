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
  /**
   * Grava a tarefa resolvida no próprio registro de ponto (design §4.6) — é o
   * que dá ao card do ponto o link para a tarefa (RF-13). Sobrescrita das
   * mesmas duas colunas, então repetir num retry é inofensivo.
   */
  saveEntryTask: (
    entryId: string,
    taskId: string,
    taskUrl: string,
  ) => Promise<void>;
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
 * Etapa `resolve`: devolve a tarefa que vai receber o ponto, criando, adotando
 * ou reaproveitando conforme o caso. Deixa o índice
 * `(projeto, título normalizado)` apontando para ela (RN-01).
 */
async function resolveTask(
  entry: PipelineEntry,
  config: ProjectConfig,
  assignee: number,
  deps: PipelineDeps,
  ctx: RunContext,
): Promise<{ id: string; url: string }> {
  const tituloNormalizado = normalizeTitle(entry.title);

  const lists = await deps.client.getLists(config.folderId);
  const destino = pickSprintList(
    lists,
    entry.workDate,
    config.sprintDateFormat,
    config.backlogListId,
  ).listId;

  // 1. Índice local — o caminho comum, sem gastar requisição de busca. Só vale
  // quando o vínculo JÁ está na Lista de destino. Se a sprint virou, o atalho é
  // proibido: mover a tarefa sem ler o status arrastaria para a sprint nova uma
  // tarefa concluída (RN-03) justamente no cenário de carry over. Nesse caso
  // caímos na busca, que classifica o status antes de decidir.
  const link = await deps.findLink(entry.project, tituloNormalizado);
  if (link && link.sprintListId === destino) {
    ctx.taskId = link.clickupTaskId;

    // O índice é por atividade, não por pessoa: quem lançou este ponto pode
    // ainda não ser responsável (RF-04). `add` só acrescenta, então repetir é
    // inofensivo. O status NÃO é tocado aqui — sem reler a tarefa não sabemos
    // se ela está parada, e na dúvida não se mexe no board (RN-02).
    await deps.client.updateTask(link.clickupTaskId, { addAssignees: [assignee] });
    return { id: link.clickupTaskId, url: link.clickupTaskUrl };
  }

  // 2. Busca no ClickUp — a tarefa pode ter nascido no planejamento da sprint,
  // ou ser a do vínculo numa sprint anterior (carry over, RF-17).
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
    ctx.taskId = existente.id;
    if (existente.listId !== destino) {
      // Carry over (RF-17): a atividade continua e a tarefa — que acabamos de
      // confirmar que NÃO está concluída — acompanha a sprint.
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
    return { id: existente.id, url: existente.url };
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
  return { id: nova.id, url: nova.url };
}

/**
 * Onde o job estava quando algo falhou. Existe para a recuperação de 404 poder
 * decidir com precisão: rebobinar só é seguro em etapa que ainda não escreveu
 * nada irreversível, e o vínculo só pode ser apagado se apontar para a tarefa
 * que de fato sumiu.
 */
type RunContext = { stage: JobStage; taskId: string | null };

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
  deps: PipelineDeps,
  ctx: RunContext,
): Promise<void> {
  let stage: JobStage = job.stage;
  let taskId = job.clickupTaskId;
  ctx.taskId = taskId;

  if (stage === "resolve") {
    // RN-09: sem vínculo com um membro, a tarefa nasceria sem responsável e
    // poluiria o board dos outros. É guarda DESTA etapa — a única que consome o
    // responsável; barrar um job já resolvido não protegeria board nenhum.
    const assignee = entry.clickupUserId;
    if (assignee === null) {
      throw new ClickUpError({
        code: "SEM_VINCULO",
        message: "Usuário sem vínculo com um membro do ClickUp.",
        retryable: false,
      });
    }

    const tarefaResolvida = await resolveTask(entry, config, assignee, deps, ctx);
    taskId = tarefaResolvida.id;
    ctx.taskId = taskId;
    // Antes de avançar o stage, não depois: se esta gravação falhar, o retry
    // refaz o `resolve` (que converge para a mesma tarefa) e tenta de novo.
    // Depois do avanço, o ponto ficaria para sempre sem o link da tarefa.
    await deps.saveEntryTask(entry.id, tarefaResolvida.id, tarefaResolvida.url);
    await deps.saveProgress(job.id, { stage: "comment", clickupTaskId: taskId });
    stage = "comment";
    ctx.stage = stage;
  }

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
    ctx.stage = stage;
  }

  if (stage === "time_entry") {
    // Um ponto editado NÃO relança tempo. O lançamento original permanece como
    // está — a API não nos deixa emendá-lo, e criar um segundo inflaria as
    // horas da pessoa no ClickUp, o que é estritamente pior. A duração nova
    // chega pelo comentário de correção (RN-06). Decisão consciente, não
    // esquecimento: o relatório oficial de horas é o do controlbio (RN-11).
    const token =
      job.kind === "correction" ? null : await deps.personalToken(entry.userId);
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
      // Correção, ou conta pessoal não conectada (RN-12): pula a etapa sem
      // erro nenhum e sem travar o job.
      await deps.saveProgress(job.id, { stage: "finish" });
    }
    stage = "finish";
    ctx.stage = stage;
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
 * A tarefa não existe mais no ClickUp (404) — design §5.2.
 *
 * Duas decisões, ambas para não trocar um erro por uma duplicata:
 *
 * - **apagar o vínculo só se ele apontar para a tarefa que sumiu.** O índice
 *   pode já ter avançado para outra tarefa (RN-03) enquanto este job carregava
 *   a antiga; apagar às cegas destruiria um vínculo válido.
 * - **rebobinar só a partir de `resolve` ou `comment`.** Aí nada irreversível
 *   foi escrito e recomeçar é barato. De `time_entry` em diante o comentário —
 *   e talvez o lançamento de tempo — já existem: recomeçar dobraria as horas da
 *   pessoa por causa de um 404 que pode até ser transitório. Nesses casos o job
 *   fica onde está, tenta de novo, falha e aparece para o admin. É o desfecho
 *   honesto.
 */
async function recuperarTarefaSumiu(
  err: unknown,
  job: ClickUpSyncJob,
  entry: PipelineEntry,
  ctx: RunContext,
  deps: PipelineDeps,
): Promise<void> {
  if (!(err instanceof ClickUpError) || err.code !== "TAREFA_SUMIU") return;

  try {
    const tituloNormalizado = normalizeTitle(entry.title);
    const link = await deps.findLink(entry.project, tituloNormalizado);
    if (ctx.taskId && link?.clickupTaskId === ctx.taskId) {
      await deps.deleteLink(entry.project, tituloNormalizado);
    }

    if (ctx.stage === "resolve" || ctx.stage === "comment") {
      await deps.saveProgress(job.id, { stage: "resolve" });
    }
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

  // Antes de qualquer guarda: um job que já percorreu tudo e caiu antes do
  // `completeJob` volta para cá. Se o projeto tivesse sido desligado ou o
  // vínculo removido nesse meio tempo, uma falha terminal aqui seria mentira —
  // todas as escritas no ClickUp já deram certo — e deixaria o ponto sem chegar
  // a `synced`.
  if (job.stage === "done") return;

  // RN-08: projeto sem configuração — ou com a integração desligada — não envia
  // nada. Terminal: insistir não resolve, o admin é que precisa agir. A guarda
  // vale para todas as etapas porque o `finish` também depende da configuração
  // (o `doneStatus`).
  const config = await deps.getConfig(entry.project);
  if (!config) {
    throw new ClickUpError({
      code: "CONFIG_AUSENTE",
      message: `Projeto "${entry.project}" sem configuração ativa do ClickUp.`,
      retryable: false,
    });
  }

  const ctx: RunContext = { stage: job.stage, taskId: job.clickupTaskId };

  try {
    await runStages(job, entry, config, deps, ctx);
  } catch (err) {
    await recuperarTarefaSumiu(err, job, entry, ctx, deps);
    throw err;
  }
}
