import { describe, it, expect } from "vitest";
import { hasDoneStatus } from "./done-status";
import type { ProjectConfig } from "./config";

function config(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    project: "dw",
    spaceId: "space",
    folderId: "folder",
    backlogListId: "list",
    inProgressStatus: "in progress",
    doneStatus: "done",
    sprintDateFormat: "dmy",
    enabled: true,
    ...overrides,
  };
}

describe("hasDoneStatus", () => {
  it("true quando o projeto tem doneStatus configurado", () => {
    expect(hasDoneStatus(config({ doneStatus: "done" }))).toBe(true);
  });

  it("false quando doneStatus é null", () => {
    expect(hasDoneStatus(config({ doneStatus: null }))).toBe(false);
  });

  it("false quando não há configuração (projeto nunca configurado ou desligado)", () => {
    expect(hasDoneStatus(null)).toBe(false);
  });
});
