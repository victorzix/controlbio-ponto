import { describe, it, expect, vi, type Mock } from "vitest";
import type { ClickUpSyncJob } from "@/db/schema";
import type {
  ClickUpClient,
  ClickUpTask,
  CommentPart,
} from "./client";
import type { ProjectConfig } from "./config";
import { ClickUpError } from "./errors";
import type { TaskLink } from "./links";
import type { ClickUpList } from "./sprint";
import {
  buildCommentBody,
  runJob,
  type PipelineDeps,
  type PipelineEntry,
} from "./pipeline";

// --- Fixtures --------------------------------------------------------------

/**
 * Listas do folder: duas sprints com data preenchida e o backlog.
 * As datas são epoch em UTC; `pickSprintList` as converte para a data civil de
 * Brasília — por isso o fim da sprint é 02:59Z do dia seguinte (23:59 de lá).
 */
const LISTAS: ClickUpList[] = [
  {
    id: "s17",
    name: "Sprint 17 (1/6/26 - 15/6/26)",
    startDate: new Date("2026-06-01T03:00:00Z"),
    dueDate: new Date("2026-06-16T02:59:00Z"),
  },
  {
    id: "s18",
    name: "Sprint 18 (16/6/26 - 30/6/26)",
    startDate: new Date("2026-06-16T03:00:00Z"),
    dueDate: new Date("2026-07-01T02:59:00Z"),
  },
  { id: "bk", name: "Backlog", startDate: null, dueDate: null },
];

/** O dia trabalhado dos fixtures cai na Sprint 18. */
const SPRINT_DESTINO = "s18";

const CONFIG: ProjectConfig = {
  project: "labphase",
  spaceId: "sp1",
  folderId: "f1",
  backlogListId: "bk",
  inProgressStatus: "fazendo",
  doneStatus: "homologando",
  sprintDateFormat: "dmy",
  enabled: true,
};

function makeEntry(over: Partial<PipelineEntry> = {}): PipelineEntry {
  return {
    id: "e1",
    userId: "u1",
    clickupUserId: 7,
    title: "Criar Acessos",
    workDate: "2026-06-25",
    workedMinutes: 200,
    description: "Configurei o SSO e testei com dois usuários.",
    project: "labphase",
    ...over,
  };
}

function makeJob(over: Partial<ClickUpSyncJob> = {}): ClickUpSyncJob {
  return {
    id: "j1",
    kind: "push_entry",
    entryId: "e1",
    stage: "resolve",
    status: "running",
    attempts: 0,
    nextRunAt: new Date("2026-06-25T12:00:00Z"),
    lastError: null,
    clickupTaskId: null,
    clickupCommentId: null,
    clickupTimeEntryId: null,
    moveToReview: false,
    createdAt: new Date("2026-06-25T12:00:00Z"),
    updatedAt: new Date("2026-06-25T12:00:00Z"),
    ...over,
  };
}

function makeTask(over: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: "t1",
    name: "Criar Acessos",
    url: "https://app.clickup.com/t/t1",
    statusName: "fazendo",
    statusType: "custom",
    listId: SPRINT_DESTINO,
    assigneeIds: [7],
    ...over,
  };
}

/** Cliente do ClickUp inteiro em `vi.fn()`, tipado método a método. */
type FakeClient = { [K in keyof ClickUpClient]: Mock<ClickUpClient[K]> };

function makeClient(): FakeClient {
  return {
    getCurrentUser: vi.fn<ClickUpClient["getCurrentUser"]>(async () => ({
      id: 7,
      username: "Victor",
      email: "victor@exemplo.com",
    })),
    getMembers: vi.fn<ClickUpClient["getMembers"]>(async () => []),
    getSpaces: vi.fn<ClickUpClient["getSpaces"]>(async () => []),
    getFolders: vi.fn<ClickUpClient["getFolders"]>(async () => []),
    getLists: vi.fn<ClickUpClient["getLists"]>(async () => LISTAS),
    getListStatuses: vi.fn<ClickUpClient["getListStatuses"]>(async () => []),
    findTasksInLists: vi.fn<ClickUpClient["findTasksInLists"]>(async () => []),
    createTask: vi.fn<ClickUpClient["createTask"]>(async (listId, input) =>
      makeTask({ id: "t1", name: input.name, listId }),
    ),
    updateTask: vi.fn<ClickUpClient["updateTask"]>(async () => {}),
    moveTaskToList: vi.fn<ClickUpClient["moveTaskToList"]>(async () => {}),
    createComment: vi.fn<ClickUpClient["createComment"]>(async () => "c1"),
    createTimeEntry: vi.fn<ClickUpClient["createTimeEntry"]>(async () => "te1"),
  };
}

type FakeDeps = {
  client: FakeClient;
  getConfig: Mock<PipelineDeps["getConfig"]>;
  findLink: Mock<PipelineDeps["findLink"]>;
  upsertLink: Mock<PipelineDeps["upsertLink"]>;
  deleteLink: Mock<PipelineDeps["deleteLink"]>;
  loadEntry: Mock<PipelineDeps["loadEntry"]>;
  saveProgress: Mock<PipelineDeps["saveProgress"]>;
  saveEntryTask: Mock<PipelineDeps["saveEntryTask"]>;
  personalToken: Mock<PipelineDeps["personalToken"]>;
};

function makeDeps(
  opts: {
    entry?: PipelineEntry | null;
    config?: ProjectConfig | null;
    link?: TaskLink | null;
    token?: string | null;
  } = {},
): FakeDeps {
  const entry = opts.entry === undefined ? makeEntry() : opts.entry;
  const config = opts.config === undefined ? CONFIG : opts.config;
  const link = opts.link ?? null;
  const token = opts.token ?? null;

  return {
    client: makeClient(),
    getConfig: vi.fn<PipelineDeps["getConfig"]>(async () => config),
    findLink: vi.fn<PipelineDeps["findLink"]>(async () => link),
    upsertLink: vi.fn<PipelineDeps["upsertLink"]>(async () => {}),
    deleteLink: vi.fn<PipelineDeps["deleteLink"]>(async () => {}),
    loadEntry: vi.fn<PipelineDeps["loadEntry"]>(async () => entry),
    saveProgress: vi.fn<PipelineDeps["saveProgress"]>(async () => {}),
    saveEntryTask: vi.fn<PipelineDeps["saveEntryTask"]>(async () => {}),
    personalToken: vi.fn<PipelineDeps["personalToken"]>(async () => token),
  };
}

// --- buildCommentBody ------------------------------------------------------

describe("buildCommentBody", () => {
  const entry = makeEntry();

  it("põe data e tempo em negrito de verdade, não markdown", () => {
    const partes = buildCommentBody(entry, "push_entry");
    expect(partes[0]).toEqual({
      text: "25/06/2026 · 3h 20min",
      attributes: { bold: true },
    });
    // Sem asterisco: o ClickUp não interpreta markdown em comentário.
    expect(partes[0].text).not.toContain("*");
  });

  it("manda a descrição como bloco de texto sem atributo", () => {
    const partes = buildCommentBody(entry, "push_entry");
    expect(partes).toHaveLength(2);
    expect(partes[1].text).toContain("Configurei o SSO");
    expect(partes[1].text.startsWith("\n\n")).toBe(true);
    expect(partes[1].attributes).toBeUndefined();
  });

  it("marca a correção quando o ponto foi editado — RN-06", () => {
    const partes = buildCommentBody(entry, "correction");
    expect(partes[0].text).toBe("Correção · 25/06/2026 · 3h 20min");
    expect(partes[0].attributes).toEqual({ bold: true });
  });

  it("formata a data sem passar por `new Date` (não sofre com fuso)", () => {
    // 1º de janeiro é o caso que denuncia o shift de fuso: `new Date("2026-01-01")`
    // vira 31/12/2025 em Brasília.
    const partes = buildCommentBody(
      makeEntry({ workDate: "2026-01-01", workedMinutes: 45 }),
      "push_entry",
    );
    expect(partes[0].text).toBe("01/01/2026 · 45min");
  });
});

// --- resolve ---------------------------------------------------------------

describe("runJob — etapa resolve", () => {
  it("cria a tarefa quando não existe nada — CA-01", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([]);

    await runJob(makeJob(), deps);

    expect(deps.client.createTask).toHaveBeenCalledTimes(1);
    expect(deps.client.createTask).toHaveBeenCalledWith(SPRINT_DESTINO, {
      name: "Criar Acessos",
      markdownDescription: "Configurei o SSO e testei com dois usuários.",
      status: "fazendo",
      assignees: [7],
    });
    // RN-10: estimativa é intocada — nada de `time_estimate` no corpo.
    const [, criada] = deps.client.createTask.mock.calls[0];
    expect(JSON.stringify(criada)).not.toContain("estimate");

    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t1",
      clickupTaskUrl: "https://app.clickup.com/t/t1",
      sprintListId: SPRINT_DESTINO,
    });
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", {
      stage: "comment",
      clickupTaskId: "t1",
    });
  });

  it("grava a tarefa no registro de ponto — design §4.6", async () => {
    const deps = makeDeps();
    deps.client.createTask.mockResolvedValue(
      makeTask({ id: "t5", url: "https://app.clickup.com/t/t5" }),
    );

    await runJob(makeJob(), deps);

    expect(deps.saveEntryTask).toHaveBeenCalledTimes(1);
    expect(deps.saveEntryTask).toHaveBeenCalledWith(
      "e1",
      "t5",
      "https://app.clickup.com/t/t5",
    );
  });

  it("grava a tarefa do índice no registro de ponto também", async () => {
    // Reaproveitar a tarefa não pode deixar o ponto sem link para ela (RF-13).
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });

    await runJob(makeJob(), deps);

    expect(deps.saveEntryTask).toHaveBeenCalledWith(
      "e1",
      "t1",
      "https://app.clickup.com/t/t1",
    );
  });

  it("reusa a tarefa do índice local sem buscar no ClickUp — CA-02", async () => {
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });

    await runJob(makeJob(), deps);

    expect(deps.findLink).toHaveBeenCalledWith("labphase", "criar acessos");
    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.findTasksInLists).not.toHaveBeenCalled();
    expect(deps.client.moveTaskToList).not.toHaveBeenCalled();
    // A tarefa do índice segue sendo a do job, e o comentário vai nela.
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", {
      stage: "comment",
      clickupTaskId: "t1",
    });
    expect(deps.client.createComment).toHaveBeenCalledTimes(1);
    expect(deps.client.createComment.mock.calls[0][0]).toBe("t1");
  });

  it("garante o responsável na tarefa reusada do índice — RF-04", async () => {
    // O índice é por (projeto, título), não por pessoa: outra pessoa lançando a
    // mesma atividade precisa entrar como responsável. `add` é idempotente,
    // então chamar sempre é seguro — e é a única forma sem reler a tarefa.
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
      entry: makeEntry({ clickupUserId: 42 }),
    });

    await runJob(makeJob(), deps);

    expect(deps.client.updateTask).toHaveBeenCalledWith("t1", {
      addAssignees: [42],
    });
    // RN-02: sem reler a tarefa não sabemos o status — na dúvida, não mexer.
    expect(deps.client.updateTask.mock.calls[0][1]).not.toHaveProperty("status");
  });

  it("adota tarefa que já existia no ClickUp e se atribui — CA-03", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({
        id: "t9",
        // Título com caixa e espaços diferentes: casa pelo título normalizado.
        name: "criar  ACESSOS",
        url: "https://app.clickup.com/t/t9",
        statusName: "backlog",
        statusType: "open",
        listId: "bk",
        assigneeIds: [],
      }),
    ]);

    await runJob(makeJob(), deps);

    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.findTasksInLists).toHaveBeenCalledWith([
      "s17",
      "s18",
      "bk",
    ]);
    expect(deps.client.updateTask).toHaveBeenCalledWith("t9", {
      status: "fazendo",
      addAssignees: [7],
    });
    // Estava no backlog e o destino é a sprint: acompanha (RF-17).
    expect(deps.client.moveTaskToList).toHaveBeenCalledWith("t9", SPRINT_DESTINO);
    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t9",
      clickupTaskUrl: "https://app.clickup.com/t/t9",
      sprintListId: SPRINT_DESTINO,
    });
  });

  it("não mexe no status de tarefa já adiante — CA-04, RN-02", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({ statusName: "em teste", statusType: "custom", assigneeIds: [] }),
    ]);

    await runJob(makeJob(), deps);

    expect(deps.client.updateTask).toHaveBeenCalledTimes(1);
    expect(deps.client.updateTask).toHaveBeenCalledWith("t1", {
      addAssignees: [7],
    });
    expect(deps.client.updateTask.mock.calls[0][1]).not.toHaveProperty("status");
    // E o comentário entra normalmente na tarefa intocada.
    expect(deps.client.createComment).toHaveBeenCalledTimes(1);
  });

  it("não chama updateTask quando não há nada a mudar", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({ statusType: "custom", assigneeIds: [7] }),
    ]);

    await runJob(makeJob(), deps);

    expect(deps.client.updateTask).not.toHaveBeenCalled();
  });

  it("move a tarefa quando a sprint virou — CA-05, RF-17", async () => {
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: "s17",
      },
    });

    await runJob(makeJob(), deps);

    expect(deps.client.moveTaskToList).toHaveBeenCalledTimes(1);
    expect(deps.client.moveTaskToList).toHaveBeenCalledWith("t1", "s18");
    expect(deps.client.createTask).not.toHaveBeenCalled();
    // O índice passa a apontar para a sprint nova (mesma tarefa — RN-01).
    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t1",
      clickupTaskUrl: "https://app.clickup.com/t/t1",
      sprintListId: "s18",
    });
  });

  it("cria tarefa nova quando a anterior está concluída — CA-06, RN-03", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({
        id: "t1",
        statusName: "concluído",
        statusType: "closed",
        listId: "s17",
      }),
    ]);
    deps.client.createTask.mockResolvedValue(
      makeTask({ id: "t2", url: "https://app.clickup.com/t/t2" }),
    );

    await runJob(makeJob(), deps);

    // A concluída não é tocada: nem movida, nem alterada.
    expect(deps.client.moveTaskToList).not.toHaveBeenCalled();
    expect(deps.client.updateTask).not.toHaveBeenCalled();
    expect(deps.client.createTask).toHaveBeenCalledTimes(1);
    expect(deps.client.createTask.mock.calls[0][0]).toBe(SPRINT_DESTINO);
    // O índice reaponta para a tarefa nova (design §2.3).
    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t2",
      clickupTaskUrl: "https://app.clickup.com/t/t2",
      sprintListId: SPRINT_DESTINO,
    });
    expect(deps.client.createComment.mock.calls[0][0]).toBe("t2");
  });

  it("cai no backlog quando nenhuma sprint cobre o dia — CA-21, RF-07", async () => {
    const deps = makeDeps({
      entry: makeEntry({ workDate: "2026-08-10" }),
    });

    await runJob(makeJob(), deps);

    expect(deps.client.createTask.mock.calls[0][0]).toBe("bk");
  });

  it("falha terminal sem configuração — CA-14, RN-08", async () => {
    const deps = makeDeps({ config: null });

    await expect(runJob(makeJob(), deps)).rejects.toBeInstanceOf(ClickUpError);
    await expect(runJob(makeJob(), deps)).rejects.toMatchObject({
      code: "CONFIG_AUSENTE",
      retryable: false,
    });
    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("falha terminal sem vínculo de membro — CA-15, RN-09", async () => {
    const deps = makeDeps({ entry: makeEntry({ clickupUserId: null }) });

    await expect(runJob(makeJob(), deps)).rejects.toMatchObject({
      code: "SEM_VINCULO",
      retryable: false,
    });
    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("não faz nada quando o ponto foi excluído no meio do caminho — RN-07", async () => {
    const deps = makeDeps({ entry: null });

    await expect(runJob(makeJob(), deps)).resolves.toBeUndefined();

    expect(deps.getConfig).not.toHaveBeenCalled();
    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });
});

// --- comentário ------------------------------------------------------------

describe("runJob — etapa comment", () => {
  it("comenta na tarefa com o corpo rico — RF-05", async () => {
    const deps = makeDeps();

    await runJob(makeJob(), deps);

    expect(deps.client.createComment).toHaveBeenCalledTimes(1);
    const [taskId, partes] = deps.client.createComment.mock.calls[0];
    expect(taskId).toBe("t1");
    expect(partes).toEqual<CommentPart[]>([
      { text: "25/06/2026 · 3h 20min", attributes: { bold: true } },
      { text: "\n\nConfigurei o SSO e testei com dois usuários." },
    ]);
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", {
      stage: "time_entry",
      clickupCommentId: "c1",
    });
  });

  it("um ponto editado gera comentário de correção — CA-22, RN-06", async () => {
    const deps = makeDeps();

    await runJob(makeJob({ kind: "correction" }), deps);

    const [, partes] = deps.client.createComment.mock.calls[0];
    expect(partes[0].text).toBe("Correção · 25/06/2026 · 3h 20min");
  });
});

// --- idempotência ----------------------------------------------------------

describe("runJob — idempotência (RN-13, CA-12)", () => {
  it("job retomado no stage 'comment' não recria a tarefa", async () => {
    const deps = makeDeps();

    await runJob(makeJob({ stage: "comment", clickupTaskId: "t1" }), deps);

    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.findTasksInLists).not.toHaveBeenCalled();
    expect(deps.client.getLists).not.toHaveBeenCalled();
    expect(deps.findLink).not.toHaveBeenCalled();
    expect(deps.upsertLink).not.toHaveBeenCalled();
    expect(deps.client.createComment).toHaveBeenCalledTimes(1);
    expect(deps.client.createComment.mock.calls[0][0]).toBe("t1");
  });

  it("job retomado no stage 'comment' não regrava a tarefa no ponto", async () => {
    const deps = makeDeps();

    await runJob(makeJob({ stage: "comment", clickupTaskId: "t1" }), deps);

    // A escrita é do `resolve`, que não roda de novo. (E, se rodasse, seria uma
    // sobrescrita das mesmas duas colunas — inofensiva.)
    expect(deps.saveEntryTask).not.toHaveBeenCalled();
  });

  it("job retomado no stage 'time_entry' não recomenta", async () => {
    const deps = makeDeps({ token: "pk_x" });

    await runJob(
      makeJob({
        stage: "time_entry",
        clickupTaskId: "t1",
        clickupCommentId: "c1",
      }),
      deps,
    );

    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.client.createTimeEntry).toHaveBeenCalledTimes(1);
  });

  it("job retomado no stage 'finish' não relança tempo", async () => {
    const deps = makeDeps({ token: "pk_x" });

    await runJob(
      makeJob({
        stage: "finish",
        clickupTaskId: "t1",
        clickupCommentId: "c1",
        clickupTimeEntryId: "te1",
        moveToReview: true,
      }),
      deps,
    );

    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.client.createTimeEntry).not.toHaveBeenCalled();
    expect(deps.personalToken).not.toHaveBeenCalled();
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });
  });

  it("job já em 'done' não escreve nada no ClickUp", async () => {
    const deps = makeDeps({ token: "pk_x" });

    await runJob(
      makeJob({ stage: "done", clickupTaskId: "t1", clickupCommentId: "c1" }),
      deps,
    );

    expect(deps.client.createTask).not.toHaveBeenCalled();
    expect(deps.client.createComment).not.toHaveBeenCalled();
    expect(deps.client.createTimeEntry).not.toHaveBeenCalled();
    expect(deps.client.updateTask).not.toHaveBeenCalled();
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("grava o progresso de cada etapa antes de começar a seguinte", async () => {
    // É esta ordem — chamada ao ClickUp, depois `saveProgress`, depois a próxima
    // etapa — que impede o retry de duplicar qualquer coisa (RN-13).
    const ordem: string[] = [];
    const deps = makeDeps({ token: "pk_x" });
    deps.client.createTask.mockImplementation(async () => {
      ordem.push("createTask");
      return makeTask();
    });
    deps.client.createComment.mockImplementation(async () => {
      ordem.push("createComment");
      return "c1";
    });
    deps.client.createTimeEntry.mockImplementation(async () => {
      ordem.push("createTimeEntry");
      return "te1";
    });
    deps.saveProgress.mockImplementation(async (_jobId, patch) => {
      ordem.push(`save:${patch.stage}`);
    });
    deps.saveEntryTask.mockImplementation(async () => {
      ordem.push("saveEntryTask");
    });

    await runJob(makeJob({ moveToReview: true }), deps);

    expect(ordem).toEqual([
      "createTask",
      // Antes do avanço de stage: se esta gravação falhar, o retry refaz o
      // `resolve` e tenta de novo. Depois do avanço, o ponto ficaria para
      // sempre sem o link da tarefa.
      "saveEntryTask",
      "save:comment",
      "createComment",
      "save:time_entry",
      "createTimeEntry",
      "save:finish",
      "save:done",
    ]);
    expect(deps.saveProgress.mock.calls).toEqual([
      ["j1", { stage: "comment", clickupTaskId: "t1" }],
      ["j1", { stage: "time_entry", clickupCommentId: "c1" }],
      ["j1", { stage: "finish", clickupTimeEntryId: "te1" }],
      ["j1", { stage: "done" }],
    ]);
  });

  it("esquece o índice e volta para 'resolve' quando a tarefa sumiu — design §5.2", async () => {
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });
    deps.client.createComment.mockRejectedValue(
      new ClickUpError({
        code: "TAREFA_SUMIU",
        message: "Recurso não encontrado no ClickUp.",
        status: 404,
        retryable: true,
      }),
    );

    await expect(
      runJob(makeJob({ stage: "comment", clickupTaskId: "t1" }), deps),
    ).rejects.toMatchObject({ code: "TAREFA_SUMIU", retryable: true });

    expect(deps.deleteLink).toHaveBeenCalledWith("labphase", "criar acessos");
    // Volta ao início para recriar a tarefa na próxima tentativa.
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "resolve" });
  });

  it("não mexe no índice quando o erro não é 'tarefa sumiu'", async () => {
    const deps = makeDeps();
    deps.client.createComment.mockRejectedValue(
      new ClickUpError({
        code: "INDISPONIVEL",
        message: "ClickUp indisponível (HTTP 503).",
        status: 503,
        retryable: true,
      }),
    );

    await expect(runJob(makeJob(), deps)).rejects.toMatchObject({
      code: "INDISPONIVEL",
    });

    expect(deps.deleteLink).not.toHaveBeenCalled();
    // O progresso do `resolve` continua gravado — o retry não recria a tarefa.
    expect(deps.saveProgress).toHaveBeenCalledTimes(1);
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", {
      stage: "comment",
      clickupTaskId: "t1",
    });
  });
});

// --- etapas finais ---------------------------------------------------------

describe("runJob — etapas finais", () => {
  it("pula o lançamento de tempo sem token pessoal — CA-17, RN-12", async () => {
    const deps = makeDeps({ token: null });

    await runJob(makeJob(), deps);

    expect(deps.client.createTimeEntry).not.toHaveBeenCalled();
    // Sem erro e sem parar: o job segue para `finish` e chega em `done`.
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "finish" });
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });
  });

  it("lança tempo com o token pessoal — CA-16, RF-18", async () => {
    const deps = makeDeps({ token: "pk_x" });

    await runJob(makeJob(), deps);

    expect(deps.personalToken).toHaveBeenCalledWith("u1");
    expect(deps.client.createTimeEntry).toHaveBeenCalledTimes(1);
    const [input, token] = deps.client.createTimeEntry.mock.calls[0];
    expect(token).toBe("pk_x");
    expect(input.taskId).toBe("t1");
    expect(input.durationMs).toBe(200 * 60_000);
    // O ponto registra duração, não horário: o início é 09:00 em Brasília do
    // dia trabalhado — 12:00Z.
    expect(new Date(input.startMs).toISOString()).toBe(
      "2026-06-25T12:00:00.000Z",
    );
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", {
      stage: "finish",
      clickupTimeEntryId: "te1",
    });
  });

  it("job de correção nunca lança tempo, mesmo com token pessoal", async () => {
    // Editar um ponto não pode inflar as horas de ninguém no ClickUp: o
    // lançamento original permanece, e a correção vive no comentário (RN-06).
    const deps = makeDeps({ token: "pk_x" });

    await runJob(makeJob({ kind: "correction" }), deps);

    expect(deps.client.createTimeEntry).not.toHaveBeenCalled();
    expect(deps.personalToken).not.toHaveBeenCalled();
    // E o job segue normalmente até o fim.
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "finish" });
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });
  });

  it("job de correção retomado em 'time_entry' também pula o lançamento", async () => {
    const deps = makeDeps({ token: "pk_x" });

    await runJob(
      makeJob({
        kind: "correction",
        stage: "time_entry",
        clickupTaskId: "t1",
        clickupCommentId: "c2",
      }),
      deps,
    );

    expect(deps.client.createTimeEntry).not.toHaveBeenCalled();
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "finish" });
  });

  it("só move para conclusão quando pedido e configurado — CA-08, RF-09", async () => {
    const resumido = {
      stage: "finish" as const,
      clickupTaskId: "t1",
      clickupCommentId: "c1",
    };

    // 1. Não foi pedido no encerramento do cronômetro (RN-04).
    const semPedido = makeDeps();
    await runJob(makeJob({ ...resumido, moveToReview: false }), semPedido);
    expect(semPedido.client.updateTask).not.toHaveBeenCalled();
    expect(semPedido.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });

    // 2. Foi pedido, mas o projeto não tem status de conclusão configurado.
    const semStatus = makeDeps({ config: { ...CONFIG, doneStatus: null } });
    await runJob(makeJob({ ...resumido, moveToReview: true }), semStatus);
    expect(semStatus.client.updateTask).not.toHaveBeenCalled();
    expect(semStatus.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });

    // 3. Pedido e configurado: a tarefa vai para o status de conclusão.
    const completo = makeDeps();
    await runJob(makeJob({ ...resumido, moveToReview: true }), completo);
    expect(completo.client.updateTask).toHaveBeenCalledTimes(1);
    expect(completo.client.updateTask).toHaveBeenCalledWith("t1", {
      status: "homologando",
    });
    expect(completo.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });
  });
});
