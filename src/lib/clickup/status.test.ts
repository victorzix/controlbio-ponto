import { describe, it, expect } from "vitest";
import { classifyStatus, shouldMoveToInProgress, findStatusByName } from "./status";

describe("classifyStatus", () => {
  it("open e unstarted são parados", () => {
    expect(classifyStatus("open")).toBe("parado");
    expect(classifyStatus("unstarted")).toBe("parado");
  });

  it("custom é adiante", () => {
    expect(classifyStatus("custom")).toBe("adiante");
  });

  it("done e closed são concluídos", () => {
    expect(classifyStatus("done")).toBe("concluido");
    expect(classifyStatus("closed")).toBe("concluido");
  });

  it("tipo desconhecido é tratado como adiante (não mexe)", () => {
    expect(classifyStatus("qualquer-coisa")).toBe("adiante");
  });
});

describe("shouldMoveToInProgress", () => {
  it("move só o que está parado — RN-02", () => {
    expect(shouldMoveToInProgress("open")).toBe(true);
    expect(shouldMoveToInProgress("unstarted")).toBe(true);
  });

  it("não regride quem já está adiante ou concluído", () => {
    expect(shouldMoveToInProgress("custom")).toBe(false);
    expect(shouldMoveToInProgress("done")).toBe(false);
    expect(shouldMoveToInProgress("closed")).toBe(false);
  });
});

describe("findStatusByName", () => {
  // Status reais do folder RPA do workspace.
  const statuses = [
    { id: "a", status: "backlog", type: "open" },
    { id: "b", status: "fazendo", type: "custom" },
    { id: "c", status: "em produção", type: "closed" },
  ];

  it("acha ignorando caixa e acento", () => {
    expect(findStatusByName(statuses, "FAZENDO")?.id).toBe("b");
    expect(findStatusByName(statuses, "em producao")?.id).toBe("c");
  });

  it("devolve null quando o status não existe na Lista", () => {
    expect(findStatusByName(statuses, "waiting code review")).toBeNull();
  });
});
