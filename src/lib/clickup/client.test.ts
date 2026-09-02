import { describe, it, expect } from "vitest";
import { createClickUpClient } from "./client";
import { ClickUpError } from "./errors";

type Call = { url: string; init: RequestInit | undefined };

/** fetch falso: devolve respostas roteirizadas e grava o que foi chamado. */
function fakeFetch(
  routes: { match: string; status?: number; body?: unknown; headers?: Record<string, string> }[],
) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`rota não roteirizada: ${url}`);
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(routes: Parameters<typeof fakeFetch>[0]) {
  const { impl, calls } = fakeFetch(routes);
  return {
    calls,
    c: createClickUpClient({
      token: "pk_teste",
      teamId: "9013352145",
      perMinute: 10_000, // sem espera no teste
      fetchImpl: impl,
    }),
  };
}

describe("ClickUpClient", () => {
  it("manda o token sem o prefixo Bearer", async () => {
    const { c, calls } = client([
      { match: "/v2/user", body: { user: { id: 1, username: "Victor", email: "v@x.com" } } },
    ]);
    await c.getCurrentUser();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("pk_teste");
  });

  it("converte a Lista, incluindo datas nulas", async () => {
    const { c } = client([
      {
        match: "/v2/folder/90132809457/list",
        body: {
          lists: [
            { id: "s17", name: "Sprint 17", start_date: "1756684800000", due_date: "1757894400000" },
            { id: "bk", name: "Backlog", start_date: null, due_date: null },
          ],
        },
      },
    ]);
    const lists = await c.getLists("90132809457");
    expect(lists[0].startDate).toBeInstanceOf(Date);
    expect(lists[1].startDate).toBeNull();
  });

  it("cria tarefa com markdown_description, status e assignee", async () => {
    const { c, calls } = client([
      {
        match: "/v2/list/s17/task",
        body: { id: "t1", name: "Criar Acessos", url: "https://app.clickup.com/t/t1",
                status: { status: "fazendo", type: "custom" }, list: { id: "s17" }, assignees: [{ id: 7 }] },
      },
    ]);
    const task = await c.createTask("s17", {
      name: "Criar Acessos",
      markdownDescription: "**feito**",
      status: "fazendo",
      assignees: [7],
    });
    expect(task.id).toBe("t1");
    expect(task.statusType).toBe("custom");
    expect(task.assigneeIds).toEqual([7]);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.markdown_description).toBe("**feito**");
    expect(body.assignees).toEqual([7]);
  });

  it("adiciona assignee sem remover os existentes", async () => {
    const { c, calls } = client([{ match: "/v2/task/t1", body: {} }]);
    await c.updateTask("t1", { addAssignees: [7] });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.assignees).toEqual({ add: [7] });
  });

  it("move a tarefa pelo endpoint v3 de home_list", async () => {
    const { c, calls } = client([{ match: "/v3/workspaces/", body: {} }]);
    await c.moveTaskToList("t1", "s18");
    expect(calls[0].url).toContain("/v3/workspaces/9013352145/tasks/t1/home_list/s18");
    expect(calls[0].init?.method).toBe("PUT");
  });

  it("comenta com o array `comment`, não com markdown em `comment_text`", async () => {
    // A API não interpreta markdown em comentário (design §4): formatação só
    // existe via array de partes `{ text, attributes }`. O id vem na RAIZ da
    // resposta, não sob `data`.
    const { c, calls } = client([
      { match: "/v2/task/t1/comment", body: { id: "c1", hist_id: "h1", date: "1" } },
    ]);
    const id = await c.createComment("t1", [
      { text: "25/06/2026 · 3h 20min", attributes: { bold: true } },
      { text: "\n\nConfigurei o SSO." },
    ]);
    expect(id).toBe("c1");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.comment_text).toBeUndefined();
    expect(body.comment).toEqual([
      { text: "25/06/2026 · 3h 20min", attributes: { bold: true } },
      { text: "\n\nConfigurei o SSO." },
    ]);
  });

  it("lança tempo com o token pessoal, não com o de serviço", async () => {
    const { c, calls } = client([
      { match: "/time_entries", body: { data: { id: "te1" } } },
    ]);
    const id = await c.createTimeEntry(
      { taskId: "t1", startMs: 1, durationMs: 60_000, description: "x" },
      "pk_pessoal",
    );
    expect(id).toBe("te1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("pk_pessoal");
  });

  it("traduz 401 em ClickUpError terminal", async () => {
    const { c } = client([{ match: "/v2/user", status: 401, body: { err: "Token inválido" } }]);
    await expect(c.getCurrentUser()).rejects.toBeInstanceOf(ClickUpError);
    await expect(c.getCurrentUser()).rejects.toMatchObject({
      code: "TOKEN_INVALIDO",
      retryable: false,
    });
  });

  it("traduz 429 lendo o X-RateLimit-Reset", async () => {
    const { c } = client([
      { match: "/v2/user", status: 429, body: {}, headers: { "X-RateLimit-Reset": "1756684800" } },
    ]);
    await expect(c.getCurrentUser()).rejects.toMatchObject({ code: "RATE_LIMIT", retryable: true });
  });

  it("desiste depois do teto de páginas em vez de paginar para sempre", async () => {
    // Página sempre cheia: sem teto, o `for(;;)` de `findTasksInLists` gira
    // indefinidamente queimando o orçamento de requisições compartilhado com a
    // tela do admin. É o único laço sem limite da integração.
    const cheia = {
      tasks: Array.from({ length: 100 }, (_, i) => ({
        id: `t${i}`,
        name: `Tarefa ${i}`,
        url: `https://app.clickup.com/t/t${i}`,
        status: { status: "fazendo", type: "custom" },
        list: { id: "l1" },
        assignees: [],
      })),
    };
    const { c, calls } = client([{ match: "/task?", body: cheia }]);

    await expect(c.findTasksInLists(["l1"])).rejects.toMatchObject({
      code: "DESCONHECIDO",
      retryable: false,
    });
    expect(calls).toHaveLength(20);
  });
});
