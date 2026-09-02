import { describe, it, expect } from "vitest";
import { projectConfigSchema } from "./validation";

const valido = {
  project: "labphase", spaceId: "901310643075", folderId: "90132809457",
  backlogListId: "901322890308", inProgressStatus: "fazendo",
  doneStatus: "homologando", sprintDateFormat: "mdy", enabled: true,
};

describe("projectConfigSchema", () => {
  it("aceita configuração completa", () => {
    expect(projectConfigSchema.safeParse(valido).success).toBe(true);
  });

  it("exige folder e backlog", () => {
    expect(projectConfigSchema.safeParse({ ...valido, folderId: "" }).success).toBe(false);
    expect(projectConfigSchema.safeParse({ ...valido, backlogListId: "" }).success).toBe(false);
  });

  it("exige status de andamento", () => {
    expect(projectConfigSchema.safeParse({ ...valido, inProgressStatus: "" }).success).toBe(false);
  });

  it("aceita status de conclusão vazio (opcional)", () => {
    expect(projectConfigSchema.safeParse({ ...valido, doneStatus: "" }).success).toBe(true);
  });

  it("só aceita dmy ou mdy como formato de data", () => {
    expect(projectConfigSchema.safeParse({ ...valido, sprintDateFormat: "ymd" }).success).toBe(false);
  });
});
