/**
 * Cliente HTTP do ClickUp — spec 011, design §5.1.
 *
 * Único lugar do código que fala HTTP com o ClickUp: a fila e as telas usam
 * só o tipo `ClickUpClient` (substituído por um fake nos testes deles). Sem
 * retry aqui — reagendar com backoff é responsabilidade da fila (spec §5.2);
 * este módulo só traduz uma chamada em erro classificado ou resultado tipado.
 *
 * Import de `ClickUpList`/`ClickUpStatus` vem de `sprint.ts`/`status.ts` —
 * não redeclarar, são o mesmo tipo usado pelo resto do pipeline.
 */

import { classifyHttp } from "./errors";
import { createRateLimiter } from "./rate-limit";
import type { ClickUpList } from "./sprint";
import type { ClickUpStatus } from "./status";

export type ClickUpClient = {
  getCurrentUser(): Promise<{ id: number; username: string; email: string }>;
  getMembers(): Promise<{ id: number; username: string; email: string }[]>;
  getSpaces(): Promise<{ id: string; name: string }[]>;
  getFolders(spaceId: string): Promise<{ id: string; name: string }[]>;
  getLists(folderId: string): Promise<ClickUpList[]>;
  getListStatuses(listId: string): Promise<ClickUpStatus[]>;
  findTasksInLists(listIds: string[]): Promise<ClickUpTask[]>;
  createTask(listId: string, input: CreateTaskInput): Promise<ClickUpTask>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<void>;
  moveTaskToList(taskId: string, listId: string): Promise<void>;
  createComment(taskId: string, markdown: string): Promise<string>;
  createTimeEntry(input: TimeEntryInput, token: string): Promise<string>;
};

export type ClickUpTask = {
  id: string;
  name: string;
  url: string;
  statusName: string;
  statusType: string;
  listId: string;
  assigneeIds: number[];
};

export type CreateTaskInput = {
  name: string;
  markdownDescription: string;
  status: string;
  assignees: number[];
};

export type UpdateTaskInput = { status?: string; addAssignees?: number[] };

export type TimeEntryInput = {
  taskId: string;
  startMs: number;
  durationMs: number;
  description: string;
};

const DEFAULT_BASE_URL = "https://api.clickup.com/api";
/** ClickUp pagina em blocos de 100; menos que isso na página = acabou. */
const PAGE_SIZE = 100;

// Formatos crus da API — só os campos que este módulo de fato lê. Sem
// validação de schema em runtime (fora do escopo desta tarefa): o cast em
// `request<T>()` assume que o ClickUp respeita o próprio contrato.
type RawUser = { id: number; username: string; email: string };
type RawList = {
  id: string;
  name: string;
  start_date: string | null;
  due_date: string | null;
};
type RawStatus = { id: string; status: string; type: string };
type RawTask = {
  id: string;
  name: string;
  url: string;
  status: { status: string; type: string };
  list: { id: string };
  assignees?: { id: number }[];
};

function toDateOrNull(msEpochString: string | null): Date | null {
  if (msEpochString === null) return null;
  return new Date(Number(msEpochString));
}

function mapTask(raw: RawTask): ClickUpTask {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    statusName: raw.status.status,
    statusType: raw.status.type,
    listId: raw.list.id,
    assigneeIds: (raw.assignees ?? []).map((a) => a.id),
  };
}

function parseIntOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseResetAt(value: string | null): Date | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  // X-RateLimit-Reset vem em segundos Unix; Date quer milissegundos.
  return new Date(seconds * 1000);
}

export function createClickUpClient(opts: {
  token: string;
  teamId: string;
  perMinute?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): ClickUpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const teamId = opts.teamId;
  const limiter = createRateLimiter({ perMinute: opts.perMinute ?? 90 });

  /**
   * Uma requisição, sempre sequencial: `take()` e o `await` da resposta
   * nunca correm em paralelo com outra chamada — o rate limiter (Tarefa 7)
   * não tem trava de concorrência, então duas requisições soltas ao mesmo
   * tempo podem passar as duas no mesmo token e furar o limite com um 429.
   * Por isso este cliente nunca usa `Promise.all`/`allSettled` em lugar nenhum.
   */
  async function request(
    path: string,
    init: RequestInit = {},
    tokenOverride?: string,
  ): Promise<unknown> {
    await limiter.take();

    const headers: Record<string, string> = {
      // Sem "Bearer": a doc do ClickUp pede o token pessoal (pk_...) cru no
      // header Authorization.
      Authorization: tokenOverride ?? opts.token,
      "Content-Type": "application/json",
    };

    const res = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });

    const remaining = parseIntOrNull(res.headers.get("X-RateLimit-Remaining"));
    const resetAt = parseResetAt(res.headers.get("X-RateLimit-Reset"));
    limiter.observe({ remaining, resetAt });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw classifyHttp(res.status, bodyText, resetAt);
    }

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  return {
    async getCurrentUser() {
      const data = (await request("/v2/user")) as { user: RawUser };
      return data.user;
    },

    async getMembers() {
      const data = (await request("/v2/team")) as {
        teams: { id: string; members: { user: RawUser }[] }[];
      };
      const team = data.teams.find((t) => t.id === teamId);
      return (team?.members ?? []).map((m) => m.user);
    },

    async getSpaces() {
      const data = (await request(`/v2/team/${teamId}/space`)) as {
        spaces: { id: string; name: string }[];
      };
      return data.spaces.map((s) => ({ id: s.id, name: s.name }));
    },

    async getFolders(spaceId: string) {
      const data = (await request(`/v2/space/${spaceId}/folder`)) as {
        folders: { id: string; name: string }[];
      };
      return data.folders.map((f) => ({ id: f.id, name: f.name }));
    },

    async getLists(folderId: string) {
      const data = (await request(`/v2/folder/${folderId}/list`)) as {
        lists: RawList[];
      };
      return data.lists.map((l) => ({
        id: l.id,
        name: l.name,
        startDate: toDateOrNull(l.start_date),
        dueDate: toDateOrNull(l.due_date),
      }));
    },

    async getListStatuses(listId: string) {
      const data = (await request(`/v2/list/${listId}`)) as {
        statuses: RawStatus[];
      };
      return data.statuses.map((s) => ({ id: s.id, status: s.status, type: s.type }));
    },

    async findTasksInLists(listIds: string[]) {
      const tasks: ClickUpTask[] = [];
      let page = 0;

      // Paginação sequencial de propósito: buscar página após página com
      // `await` em loop simples, nunca disparando páginas em paralelo (ver
      // comentário de `request` sobre o rate limiter sem trava).
      for (;;) {
        const qs = new URLSearchParams();
        for (const id of listIds) qs.append("list_ids[]", id);
        qs.set("include_closed", "true");
        qs.set("subtasks", "true");
        qs.set("page", String(page));

        const data = (await request(`/v2/team/${teamId}/task?${qs.toString()}`)) as {
          tasks: RawTask[];
        };
        const pageTasks = (data.tasks ?? []).map(mapTask);
        tasks.push(...pageTasks);

        if (pageTasks.length < PAGE_SIZE) break;
        page += 1;
      }

      return tasks;
    },

    async createTask(listId: string, input: CreateTaskInput) {
      const raw = (await request(`/v2/list/${listId}/task`, {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          markdown_description: input.markdownDescription,
          status: input.status,
          assignees: input.assignees,
        }),
      })) as RawTask;
      return mapTask(raw);
    },

    async updateTask(taskId: string, input: UpdateTaskInput) {
      const body: Record<string, unknown> = {};
      if (input.status !== undefined) {
        body.status = input.status;
      }
      if (input.addAssignees !== undefined) {
        // Objeto `{ add: [...] }`, não array: mandar um array substituiria
        // a lista de assignees da tarefa inteira, tirando quem mais estava
        // nela. `add` só acrescenta.
        body.assignees = { add: input.addAssignees };
      }
      await request(`/v2/task/${taskId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    async moveTaskToList(taskId: string, listId: string) {
      // Endpoint v3 (não v2) — carry over de tarefa entre Listas/sprints.
      await request(
        `/v3/workspaces/${teamId}/tasks/${taskId}/home_list/${listId}`,
        { method: "PUT" },
      );
    },

    async createComment(taskId: string, markdown: string) {
      const data = (await request(`/v2/task/${taskId}/comment`, {
        method: "POST",
        body: JSON.stringify({ comment_text: markdown }),
      })) as { id: string };
      return String(data.id);
    },

    async createTimeEntry(input: TimeEntryInput, token: string) {
      // Autentica com o token PESSOAL recebido por parâmetro, nunca com o
      // token de serviço do cliente: o lançamento de horas tem que aparecer
      // no ClickUp como feito pela própria pessoa, não pela integração.
      const data = (await request(
        `/v2/team/${teamId}/time_entries`,
        {
          method: "POST",
          body: JSON.stringify({
            tid: input.taskId,
            start: input.startMs,
            duration: input.durationMs,
            description: input.description,
          }),
        },
        token,
      )) as { data: { id: string } };
      return data.data.id;
    },
  };
}
