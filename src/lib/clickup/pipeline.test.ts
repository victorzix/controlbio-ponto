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
  ensureTaskInProgress,
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
    getTask: vi.fn<ClickUpClient["getTask"]>(async () => makeTask()),
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

// --- ensureTaskInProgress ---------------------------------------------------

/** Só o que `ensureTaskInProgress` precisa de `PipelineEntry`. */
const IDENTITY = { title: "Criar Acessos", project: "labphase" as const, workDate: "2026-06-25" };

describe("ensureTaskInProgress — gatilho eager de 'iniciar cronômetro'", () => {
  it("índice bate (branch 1) e a tarefa está parada: move para em andamento", async () => {
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });
    // `resolveTask` (branch 1) não relê o status por si — é exatamente o que
    // esta função existe para cobrir.
    deps.client.getTask.mockResolvedValue(makeTask({ statusType: "open" }));

    await ensureTaskInProgress(IDENTITY, 7, CONFIG, deps);

    expect(deps.client.getTask).toHaveBeenCalledWith("t1");
    expect(deps.client.updateTask).toHaveBeenCalledWith("t1", { status: "fazendo" });
  });

  it("índice bate e a tarefa já está em andamento: não mexe no status de novo", async () => {
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });
    // "custom" — mesmo `type` do status "em andamento" no workspace real
    // (não é `open`/`unstarted`, então `shouldMoveToInProgress` é falso).
    deps.client.getTask.mockResolvedValue(makeTask({ statusType: "custom" }));

    await ensureTaskInProgress(IDENTITY, 7, CONFIG, deps);

    // `resolveTask` (branch 1) ainda chama `updateTask` para acrescentar o
    // assignee — a garantia é que NENHUMA dessas chamadas leva `status`.
    const chamadasComStatus = deps.client.updateTask.mock.calls.filter(
      ([, input]) => "status" in input,
    );
    expect(chamadasComStatus).toHaveLength(0);
  });

  it("tarefa nasce agora (branch 3): já sai em andamento, sem chamada extra", async () => {
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([]);
    // A tarefa criada tem `inProgressStatus` desde o `createTask` — a releitura
    // reflete isso (tipo "custom", igual ao status configurado no workspace).
    deps.client.getTask.mockResolvedValue(makeTask({ statusType: "custom" }));

    await ensureTaskInProgress(IDENTITY, 7, CONFIG, deps);

    expect(deps.client.createTask).toHaveBeenCalledTimes(1);
    expect(deps.client.updateTask).not.toHaveBeenCalled();
  });

  it("é idempotente com o envio real: a mesma atividade resolve para a mesma tarefa", async () => {
    // A chamada eager (ensureTaskInProgress) e o push_entry de quando o
    // cronômetro for encerrado usam o MESMO índice — não podem criar duas
    // tarefas para a mesma atividade.
    const deps = makeDeps();
    deps.client.findTasksInLists.mockResolvedValue([]);
    deps.client.getTask.mockResolvedValue(makeTask({ statusType: "custom" }));

    await ensureTaskInProgress(IDENTITY, 7, CONFIG, deps);

    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t1",
      clickupTaskUrl: "https://app.clickup.com/t/t1",
      sprintListId: SPRINT_DESTINO,
    });

    // Simula o job real encontrando o vínculo que acabou de ser gravado.
    const deps2 = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });
    await runJob(makeJob(), deps2);

    expect(deps2.client.createTask).not.toHaveBeenCalled();
    expect(deps2.saveEntryTask).toHaveBeenCalledWith(
      "e1",
      "t1",
      "https://app.clickup.com/t/t1",
      "list_date",
    );
  });
});

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
      "list_date",
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
      "list_date",
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
    // Sprint diferente do destino: o índice não basta, porque mover sem olhar o
    // status atropelaria RN-03. Passa pela busca para classificar antes.
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({ id: "t1", listId: "s17", statusType: "custom", assigneeIds: [7] }),
    ]);

    await runJob(makeJob(), deps);

    expect(deps.client.findTasksInLists).toHaveBeenCalledTimes(1);
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

  it("busca só nas Listas que importam, não no Folder inteiro", async () => {
    // Folder realista de fim de ano: a varredura completa pagina TODAS as
    // tarefas de TODAS estas Listas a cada miss do índice, no mesmo orçamento de
    // 90 req/min da tela do admin. O alcance necessário é destino + sprint
    // anterior + Lista do vínculo + backlog.
    const muitasListas: ClickUpList[] = [
      { id: "s14", name: "Sprint 14 (1/4/26 - 15/4/26)", startDate: null, dueDate: null },
      { id: "s15", name: "Sprint 15 (16/4/26 - 30/4/26)", startDate: null, dueDate: null },
      { id: "s16", name: "Sprint 16 (1/5/26 - 15/5/26)", startDate: null, dueDate: null },
      ...LISTAS,
      { id: "s19", name: "Sprint 19 (1/7/26 - 15/7/26)", startDate: null, dueDate: null },
    ];
    const deps = makeDeps();
    deps.client.getLists.mockResolvedValue(muitasListas);

    await runJob(makeJob(), deps);

    // Destino s18, anterior s17, backlog bk — s14/s15/s16/s19 ficam de fora.
    expect(deps.client.findTasksInLists).toHaveBeenCalledWith(["s17", "s18", "bk"]);
  });

  it("inclui a Lista do vínculo na busca (ponto atrasado acha a tarefa)", async () => {
    const deps = makeDeps({
      entry: makeEntry({ workDate: "2026-06-10" }),
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: "s18",
      },
    });

    await runJob(makeJob(), deps);

    // Destino s17 (dia atrasado) + backlog + a sprint onde o índice diz que a
    // tarefa vive. Sem s18 aqui, a busca não a acharia e criaria uma duplicata.
    expect(deps.client.findTasksInLists).toHaveBeenCalledWith(["s17", "s18", "bk"]);
  });

  it("NÃO puxa a tarefa para uma sprint passada num ponto atrasado — RF-17", async () => {
    // Ponto lançado com atraso: o dia trabalhado cai na Sprint 17, mas a
    // atividade continua viva na Sprint 18 (a atual). Mover a tarefa para o
    // destino a tiraria do board corrente e a jogaria numa sprint encerrada —
    // e o próximo ponto de hoje a puxaria de volta, fazendo o card pingar entre
    // sprints. Carry over é a atividade CONTINUANDO: só vale para a frente.
    const deps = makeDeps({
      entry: makeEntry({ workDate: "2026-06-10" }),
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: "s18",
      },
    });
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({ id: "t1", listId: "s18", statusType: "custom", assigneeIds: [7] }),
    ]);

    await runJob(makeJob(), deps);

    expect(deps.client.moveTaskToList).not.toHaveBeenCalled();
    expect(deps.client.createTask).not.toHaveBeenCalled();
    // O comentário entra na tarefa onde ela de fato vive.
    expect(deps.client.createComment.mock.calls[0][0]).toBe("t1");
    // E o índice continua apontando para a sprint em que a tarefa está — não
    // para a sprint do ponto atrasado.
    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t1",
      clickupTaskUrl: "https://app.clickup.com/t/t1",
      sprintListId: "s18",
    });
  });

  it("não arrasta para a sprint nova a tarefa concluída do índice — RN-03", async () => {
    // O vínculo aponta para a sprint anterior. Mover pelo índice, sem ler o
    // status, arrastaria uma tarefa fechada para a sprint atual e comentaria
    // nela — exatamente o que RN-03 proíbe, no cenário para o qual foi escrita.
    const deps = makeDeps({
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: "s17",
      },
    });
    deps.client.findTasksInLists.mockResolvedValue([
      makeTask({
        id: "t1",
        listId: "s17",
        statusName: "concluído",
        statusType: "closed",
      }),
    ]);
    deps.client.createTask.mockResolvedValue(
      makeTask({ id: "t2", url: "https://app.clickup.com/t/t2" }),
    );

    await runJob(makeJob(), deps);

    expect(deps.client.moveTaskToList).not.toHaveBeenCalled();
    expect(deps.client.updateTask).not.toHaveBeenCalled();
    expect(deps.client.createTask).toHaveBeenCalledTimes(1);
    expect(deps.client.createTask.mock.calls[0][0]).toBe(SPRINT_DESTINO);
    expect(deps.upsertLink).toHaveBeenCalledWith({
      project: "labphase",
      normalizedTitle: "criar acessos",
      clickupTaskId: "t2",
      clickupTaskUrl: "https://app.clickup.com/t/t2",
      sprintListId: SPRINT_DESTINO,
    });
    expect(deps.client.createComment.mock.calls[0][0]).toBe("t2");
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
    // O registro fica marcado com a origem 'backlog' — é o que liga o aviso
    // "sincronizado sem sprint" no card do ponto (Tarefa 16).
    expect(deps.saveEntryTask).toHaveBeenCalledWith(
      "e1",
      "t1",
      "https://app.clickup.com/t/t1",
      "backlog",
    );
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

  it("job em 'done' não falha por configuração desligada depois", async () => {
    // O job terminou tudo no ClickUp e caiu antes do `completeJob`. Se a
    // integração do projeto foi desligada nesse meio tempo, marcá-lo como
    // falha terminal seria mentira — e o ponto nunca chegaria a `synced`.
    const deps = makeDeps({ config: null });

    await expect(
      runJob(makeJob({ stage: "done", clickupTaskId: "t1" }), deps),
    ).resolves.toBeUndefined();

    expect(deps.getConfig).not.toHaveBeenCalled();
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("job em 'done' não falha por vínculo removido depois", async () => {
    const deps = makeDeps({ entry: makeEntry({ clickupUserId: null }) });

    await expect(
      runJob(makeJob({ stage: "done", clickupTaskId: "t1" }), deps),
    ).resolves.toBeUndefined();

    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("etapa final não exige vínculo — só o `resolve` usa o responsável", async () => {
    // `SEM_VINCULO` é guarda do `resolve`, onde o assignee é consumido. Um job
    // retomado em `finish` já criou tudo; barrá-lo aqui não protege board nenhum.
    const deps = makeDeps({ entry: makeEntry({ clickupUserId: null }) });

    await runJob(
      makeJob({
        stage: "finish",
        clickupTaskId: "t1",
        clickupCommentId: "c1",
        moveToReview: true,
      }),
      deps,
    );

    expect(deps.client.updateTask).toHaveBeenCalledWith("t1", {
      status: "homologando",
    });
    expect(deps.saveProgress).toHaveBeenCalledWith("j1", { stage: "done" });
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

  it("não rebobina o job quando a tarefa some depois do comentário", async () => {
    // Em `time_entry` o comentário já foi criado. Voltar para `resolve` faria o
    // retry recriar tarefa, recomentar e relançar tempo — duplicando as horas
    // da pessoa por causa de um 404 que pode até ser transitório.
    const deps = makeDeps({
      token: "pk_x",
      link: {
        clickupTaskId: "t1",
        clickupTaskUrl: "https://app.clickup.com/t/t1",
        sprintListId: SPRINT_DESTINO,
      },
    });
    deps.client.createTimeEntry.mockRejectedValue(
      new ClickUpError({
        code: "TAREFA_SUMIU",
        message: "Recurso não encontrado no ClickUp.",
        status: 404,
        retryable: true,
      }),
    );

    await expect(
      runJob(
        makeJob({
          stage: "time_entry",
          clickupTaskId: "t1",
          clickupCommentId: "c1",
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "TAREFA_SUMIU" });

    // O índice é limpo (a tarefa realmente sumiu), mas o stage fica onde está.
    expect(deps.deleteLink).toHaveBeenCalledWith("labphase", "criar acessos");
    expect(deps.saveProgress).not.toHaveBeenCalled();
  });

  it("não apaga o vínculo que já aponta para outra tarefa", async () => {
    // O índice avançou (RN-03 criou uma tarefa nova) enquanto este job ainda
    // carregava a antiga: apagar aqui destruiria um vínculo válido.
    const deps = makeDeps({
      link: {
        clickupTaskId: "t2",
        clickupTaskUrl: "https://app.clickup.com/t/t2",
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
    ).rejects.toMatchObject({ code: "TAREFA_SUMIU" });

    expect(deps.deleteLink).not.toHaveBeenCalled();
    // Rebobinar continua certo: a retomada resolve pelo índice e cai na t2.
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
