import { z } from "zod";
import { PROJECT_OPTIONS, type Project } from "@/lib/ponto/validation";

// Deriva a tupla de valores válidos a partir de `PROJECT_OPTIONS` — fonte
// única da verdade dos projetos (spec 011 reutiliza o mesmo `Project` do ponto).
const PROJECT_VALUES = PROJECT_OPTIONS.map((p) => p.value) as [
  Project,
  ...Project[],
];

/**
 * Schema da configuração de integração de um projeto — spec 011, RF-10/RF-11.
 *
 * Fonte única de validação, compartilhada entre client (RHF `zodResolver`) e
 * servidor (`saveProjectConfig` revalida — CLAUDE.md §7, nunca confia no client).
 *
 * - `folderId`/`backlogListId`/`inProgressStatus` são obrigatórios: sem eles o
 *   pipeline não tem para onde mandar a tarefa (CA-13/`CONFIG_AUSENTE`).
 * - `doneStatus` é opcional (RN: nem todo fluxo tem status de "concluído"
 *   distinto do "andamento") — string vazia é um valor válido, não ausência.
 */
export const projectConfigSchema = z.object({
  project: z.enum(PROJECT_VALUES),
  spaceId: z.string().min(1, "Selecione o Space."),
  folderId: z.string().min(1, "Selecione o Folder."),
  backlogListId: z.string().min(1, "Selecione a Lista de backlog."),
  inProgressStatus: z.string().min(1, "Selecione o status de andamento."),
  doneStatus: z.string(),
  sprintDateFormat: z.enum(["dmy", "mdy"]),
  enabled: z.boolean(),
});

export type ProjectConfigFormValues = z.infer<typeof projectConfigSchema>;
