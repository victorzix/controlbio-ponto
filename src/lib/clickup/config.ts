import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clickupProjectConfig } from "@/db/schema";
import type { Project } from "@/lib/ponto/validation";
import type { SprintDateFormat } from "./sprint";

/** Configuração da integração ClickUp para um projeto — spec 011, RF-10/RF-11. */
export type ProjectConfig = {
  project: Project;
  spaceId: string;
  folderId: string;
  backlogListId: string;
  inProgressStatus: string;
  doneStatus: string | null;
  sprintDateFormat: SprintDateFormat;
  enabled: boolean;
};

/**
 * Busca a configuração do projeto.
 *
 * `null` tanto quando não há linha (nunca configurado) quanto quando `enabled`
 * é `false` (desligado pelo admin) — RN-08: um projeto desligado deve se
 * comportar exatamente como um projeto nunca configurado.
 */
export async function getProjectConfig(
  project: Project,
): Promise<ProjectConfig | null> {
  const rows = await db
    .select({
      project: clickupProjectConfig.project,
      spaceId: clickupProjectConfig.spaceId,
      folderId: clickupProjectConfig.folderId,
      backlogListId: clickupProjectConfig.backlogListId,
      inProgressStatus: clickupProjectConfig.inProgressStatus,
      doneStatus: clickupProjectConfig.doneStatus,
      sprintDateFormat: clickupProjectConfig.sprintDateFormat,
      enabled: clickupProjectConfig.enabled,
    })
    .from(clickupProjectConfig)
    .where(eq(clickupProjectConfig.project, project))
    .limit(1);

  const row = rows[0];
  if (!row || !row.enabled) return null;

  return {
    ...row,
    // A coluna é varchar livre no banco; o domínio só admite os dois formatos.
    sprintDateFormat: row.sprintDateFormat as SprintDateFormat,
  };
}

/**
 * Cria ou substitui a configuração do projeto (chave primária é o próprio
 * `project` — no máximo uma configuração por projeto).
 */
export async function upsertProjectConfig(
  input: ProjectConfig,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(clickupProjectConfig)
    .values({
      project: input.project,
      spaceId: input.spaceId,
      folderId: input.folderId,
      backlogListId: input.backlogListId,
      inProgressStatus: input.inProgressStatus,
      doneStatus: input.doneStatus,
      sprintDateFormat: input.sprintDateFormat,
      enabled: input.enabled,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: clickupProjectConfig.project,
      set: {
        spaceId: input.spaceId,
        folderId: input.folderId,
        backlogListId: input.backlogListId,
        inProgressStatus: input.inProgressStatus,
        doneStatus: input.doneStatus,
        sprintDateFormat: input.sprintDateFormat,
        enabled: input.enabled,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}
