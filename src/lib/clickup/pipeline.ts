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
import {
  listWindow,
  pickSprintList,
  type ClickUpList,
  type SprintPick,
} from "./sprint";
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
   * que dá ao card do ponto o link para a tarefa (RF-13) e, com `sprintSource`,
   * o aviso de "sincronizado sem sprint" quando a Lista escolhida foi o
   * backlog (RF-07, CA-21). Sobrescrita das mesmas colunas, então repetir num
   * retry é inofensivo.
   */
  saveEntryTask: (
    entryId: string,
    taskId: string,
    taskUrl: string,
    sprintSource: SprintPick["source"],
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

/** Janela da Lista de id `listId` dentro de `lists` — `null` se não der para saber. */
function janelaDaLista(
  lists: ClickUpList[],
  listId: string,
  config: ProjectConfig,
  referenceISO: string,
): { start: string; end: string } | null {
  const lista = lists.find((l) => l.id === listId);
  if (!lista) return null;
  return listWindow(lista, config.sprintDateFormat, referenceISO);
}

/**
 * Em quais Listas procurar a tarefa por título — spec 011, RF-17.
 *
 * Passar o Folder inteiro custa uma varredura sem teto: `findTasksInLists`
 * pagina **todas** as tarefas de **todas** as Listas (`include_closed`,
 * `subtasks`) e isso acontece a cada miss do índice — no primeiro dia, para toda
 * atividade, e de novo a cada virada de sprint — dentro do mesmo orçamento de
 * 90 req/min da tela do admin. Fila lenta é justamente o que faz um lote
 * estourar a carência de parada do worker.
 *
 * O alcance que a lógica de fato precisa é pequeno:
 *
 * - a Lista de **destino** (a tarefa pode ter nascido no planejamento da sprint);
 * - a sprint **imediatamente anterior** ao destino (carry over para a frente);
 * - a Lista onde o **índice** diz que a tarefa está, quando há vínculo — é o que
 *   cobre o ponto atrasado, cujo destino é uma sprint passada enquanto a tarefa
 *   vive na sprint atual;
 * - o **backlog** (planejamento ainda não distribuído).
 *
 * A ordem é a do próprio Folder, para o conjunto ser estável.
 */
function listasDeBusca(
  lists: ClickUpList[],
  destinoId: string,
  vinculoListId: string | null,
  config: ProjectConfig,
  referenceISO: string,
): string[] {
  const alvo = new Set<string>([destinoId, config.backlogListId]);
  if (vinculoListId) alvo.add(vinculoListId);

  const destino = janelaDaLista(lists, destinoId, config, referenceISO);
  if (destino) {
    let anterior: { id: string; end: string } | null = null;
    for (const l of lists) {
      if (l.id === destinoId || l.id === config.backlogListId) continue;
      const w = listWindow(l, config.sprintDateFormat, referenceISO);
      if (!w || w.end >= destino.start) continue;
      if (!anterior || w.end > anterior.end) anterior = { id: l.id, end: w.end };
    }
    if (anterior) alvo.add(anterior.id);
  }

  const ids = lists.filter((l) => alvo.has(l.id)).map((l) => l.id);
  // Ids que não estão entre as Listas do Folder (backlog fora dele, vínculo
  // antigo) entram no fim — melhor procurar demais do que criar duplicata.
  for (const id of alvo) if (!ids.includes(id)) ids.push(id);
  return ids;
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
): Promise<{ id: string; url: string; source: SprintPick["source"] }> {
  const tituloNormalizado = normalizeTitle(entry.title);

  const lists = await deps.client.getLists(config.folderId);
  const pick = pickSprintList(
    lists,
    entry.workDate,
    config.sprintDateFormat,
    config.backlogListId,
  );
  const destino = pick.listId;

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
    return { id: link.clickupTaskId, url: link.clickupTaskUrl, source: pick.source };
  }

  // 2. Busca no ClickUp — a tarefa pode ter nascido no planejamento da sprint,
  // ou ser a do vínculo numa sprint anterior (carry over, RF-17). Só nas Listas
  // que importam (ver `listasDeBusca`), nunca no Folder inteiro.
  const listIds = listasDeBusca(
    lists,
    destino,
    link?.sprintListId ?? null,
    config,
    entry.workDate,
  );
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

    // Carry over (RF-17) é a atividade CONTINUANDO — sempre para a frente. Um
    // ponto atrasado tem como destino uma sprint passada enquanto a tarefa vive
    // na sprint atual: mover ali a tiraria do board corrente e a esconderia numa
    // sprint encerrada, e o próximo ponto de hoje a puxaria de volta — o card
    // pingando entre sprints para a equipe inteira. Nesse caso comentamos na
    // tarefa onde ela já está, que é o desfecho certo para um ponto atrasado.
    // Sem janela conhecida dos dois lados (ex.: veio do backlog), a direção não
    // é aferível e mantemos o comportamento de acompanhar a sprint.
    const janelaDestino = janelaDaLista(lists, destino, config, entry.workDate);
    const janelaAtual = janelaDaLista(lists, existente.listId, config, entry.workDate);
    const paraTras =
      janelaDestino !== null &&
      janelaAtual !== null &&
      janelaDestino.end < janelaAtual.end;

    const mover = existente.listId !== destino && !paraTras;
    if (mover) {
      await deps.client.moveTaskToList(existente.id, destino);
    }
    // Onde a tarefa fica de fato ao final desta etapa — é isso que o índice
    // precisa registrar, senão ele mente sobre a sprint da tarefa e obriga uma
    // busca extra no próximo ponto.
    const listaDaTarefa = mover ? destino : existente.listId;

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
      sprintListId: listaDaTarefa,
    });
    return { id: existente.id, url: existente.url, source: pick.source };
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
  return { id: nova.id, url: nova.url, source: pick.source };
}

/**
 * Onde o job estava quando algo falhou. Existe para a recuperação de 404 poder
 * decidir com precisão: rebobinar só é seguro em etapa que ainda não escreveu
 * nada irreversível, e o vínculo só pode ser apagado se apontar para a tarefa
 * que de fato sumiu.
 *
 * `onStage` leva a etapa ALCANÇADA para fora do pipeline: o chamador só tem a
 * foto do job no momento da reivindicação, então logar `job.stage` numa falha
 * subnotifica o progresso (diz "resolve" para um job que morreu em "finish").
 */
type RunContext = {
  stage: JobStage;
  taskId: string | null;
  onStage?: (stage: JobStage) => void;
};

/** Avança a etapa corrente do contexto e avisa quem estiver observando. */
function marcarEtapa(ctx: RunContext, stage: JobStage): void {
  ctx.stage = stage;
  ctx.onStage?.(stage);
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
    await deps.saveEntryTask(
      entry.id,
      tarefaResolvida.id,
      tarefaResolvida.url,
      tarefaResolvida.source,
    );
    await deps.saveProgress(job.id, { stage: "comment", clickupTaskId: taskId });
    stage = "comment";
    marcarEtapa(ctx, stage);
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
    marcarEtapa(ctx, stage);
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
    marcarEtapa(ctx, stage);
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
 *
 * `onStage` é opcional e serve só para o chamador saber em que etapa o job de
 * fato chegou — é o que permite ao worker logar a etapa REAL da falha em vez da
 * etapa que constava na reivindicação.
 */
export async function runJob(
  job: ClickUpSyncJob,
  deps: PipelineDeps,
  onStage?: (stage: JobStage) => void,
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

  const ctx: RunContext = { stage: job.stage, taskId: job.clickupTaskId, onStage };

  try {
    await runStages(job, entry, config, deps, ctx);
  } catch (err) {
    await recuperarTarefaSumiu(err, job, entry, ctx, deps);
    throw err;
  }
}
