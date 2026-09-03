import { describe, it, expect } from "vitest";
import {
  listWindow,
  parseSprintWindow,
  pickSprintList,
  type ClickUpList,
} from "./sprint";

const BACKLOG = "backlog-1";

function list(
  id: string,
  name: string,
  startDate: Date | null = null,
  dueDate: Date | null = null,
): ClickUpList {
  return { id, name, startDate, dueDate };
}

describe("parseSprintWindow", () => {
  it("lê dia/mês/ano de duas posições", () => {
    expect(parseSprintWindow("Sprint 17 (1/9/26 - 15/9/26)", "dmy", "2026-09-02"))
      .toEqual({ start: "2026-09-01", end: "2026-09-15" });
  });

  it("lê mês/dia sem ano, inferindo do dia trabalhado", () => {
    expect(parseSprintWindow("Sprint 14 (8/24 - 9/6)", "mdy", "2026-09-02"))
      .toEqual({ start: "2026-08-24", end: "2026-09-06" });
  });

  it("lê dia/mês sem ano", () => {
    expect(parseSprintWindow("Sprint 6 (17/3 - 31/3)", "dmy", "2026-03-20"))
      .toEqual({ start: "2026-03-17", end: "2026-03-31" });
  });

  it("aceita zero à esquerda", () => {
    expect(parseSprintWindow("Sprint 15 (03/08/26 - 15/8/26)", "dmy", "2026-08-10"))
      .toEqual({ start: "2026-08-03", end: "2026-08-15" });
  });

  it("infere a virada de ano quando a janela cruza dezembro", () => {
    // Ponto em janeiro/26; a sprint começou em dezembro/25.
    expect(parseSprintWindow("Sprint 10 (22/12 - 5/1)", "dmy", "2026-01-03"))
      .toEqual({ start: "2025-12-22", end: "2026-01-05" });
  });

  it("devolve null quando o nome não tem data", () => {
    expect(parseSprintWindow("Sprint 3 - Abril", "dmy", "2026-04-10")).toBeNull();
    expect(parseSprintWindow("Backlog", "dmy", "2026-04-10")).toBeNull();
  });
});

describe("pickSprintList", () => {
  it("prefere a data da própria Lista", () => {
    const lists = [
      // O nome mente de propósito: a data da Lista tem que ganhar.
      list("s17", "Sprint 17 (1/1/26 - 15/1/26)",
        new Date("2026-09-01T00:00:00Z"), new Date("2026-09-15T23:59:59Z")),
    ];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: "s17", source: "list_date" });
  });

  it("cai no nome quando a Lista não tem data", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: "s17", source: "list_name" });
  });

  it("escolhe a sprint certa entre várias", () => {
    const lists = [
      list("s16", "Sprint 16 (16/8/26 - 31/8/26)"),
      list("s17", "Sprint 17 (1/9/26 - 15/9/26)"),
      list("s18", "Sprint 18 (16/9/26 - 30/9/26)"),
    ];
    expect(pickSprintList(lists, "2026-09-20", "dmy", BACKLOG).listId).toBe("s18");
  });

  it("inclui os extremos da janela", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-09-01", "dmy", BACKLOG).listId).toBe("s17");
    expect(pickSprintList(lists, "2026-09-15", "dmy", BACKLOG).listId).toBe("s17");
  });

  it("cai no backlog quando nenhuma sprint contém o dia", () => {
    const lists = [list("s17", "Sprint 17 (1/9/26 - 15/9/26)")];
    expect(pickSprintList(lists, "2026-10-20", "dmy", BACKLOG))
      .toEqual({ listId: BACKLOG, source: "backlog" });
  });

  it("cai no backlog quando não há Lista alguma", () => {
    expect(pickSprintList([], "2026-09-02", "dmy", BACKLOG))
      .toEqual({ listId: BACKLOG, source: "backlog" });
  });

  it("ignora a própria Lista de backlog na busca", () => {
    const lists = [list(BACKLOG, "Backlog")];
    expect(pickSprintList(lists, "2026-09-02", "dmy", BACKLOG).source).toBe("backlog");
  });

  it("usa o fuso de Brasília, não UTC, para a data da Lista", () => {
    // 15/09 23:59 em Brasília (UTC-3) é 16/09 02:59 em UTC. Se a Lista usasse
    // toISOString() puro, o due_date "vazaria" para o dia 16 e um ponto batido
    // no dia 16 (fora da sprint) seria erroneamente roteado para "s17".
    const lists = [
      list("s17", "Sprint 17 (1/1/26 - 15/1/26)", // nome mente de propósito
        new Date("2026-09-01T03:00:00Z"), // 1/9 00:00 em Brasília
        new Date("2026-09-16T02:59:00Z"), // 15/9 23:59 em Brasília
      ),
    ];
    expect(pickSprintList(lists, "2026-09-15", "dmy", BACKLOG))
      .toEqual({ listId: "s17", source: "list_date" });
    expect(pickSprintList(lists, "2026-09-16", "dmy", BACKLOG))
      .toEqual({ listId: BACKLOG, source: "backlog" });
  });
});

/**
 * `listWindow` é o que permite ORDENAR sprints no tempo — comparar o destino
 * com a Lista onde a tarefa vive (carry over só para a frente, RF-17) e achar a
 * sprint imediatamente anterior ao destino (alcance da busca por título).
 */
describe("listWindow", () => {
  it("prefere a data da própria Lista, no fuso de Brasília", () => {
    const l = list(
      "s17",
      "Sprint 17 (1/1/26 - 15/1/26)", // nome mente de propósito
      new Date("2026-09-01T03:00:00Z"),
      new Date("2026-09-16T02:59:00Z"),
    );
    expect(listWindow(l, "dmy", "2026-09-02")).toEqual({
      start: "2026-09-01",
      end: "2026-09-15",
    });
  });

  it("cai no nome quando a Lista não tem data", () => {
    expect(listWindow(list("s18", "Sprint 18 (16/9/26 - 30/9/26)"), "dmy", "2026-09-20"))
      .toEqual({ start: "2026-09-16", end: "2026-09-30" });
  });

  it("devolve null para Lista sem data e sem janela no nome (o backlog)", () => {
    expect(listWindow(list(BACKLOG, "Backlog"), "dmy", "2026-09-02")).toBeNull();
  });
});
