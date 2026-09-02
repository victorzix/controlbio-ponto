import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clickupTaskLinks } from "@/db/schema";
import type { Project } from "@/lib/ponto/validation";

/** Tarefa do ClickUp vinculada a uma atividade (título normalizado) de um projeto. */
export type TaskLink = {
  clickupTaskId: string;
  clickupTaskUrl: string;
  sprintListId: string;
};

/**
 * Busca a tarefa já vinculada a `(project, normalizedTitle)`.
 *
 * A chave de identidade é sem a sprint (RN-01, ver `schema.ts`): a mesma
 * atividade reaproveita a tarefa mesmo quando ela migra de sprint.
 */
export async function findTaskLink(
  project: Project,
  normalizedTitle: string,
): Promise<TaskLink | null> {
  const rows = await db
    .select({
      clickupTaskId: clickupTaskLinks.clickupTaskId,
      clickupTaskUrl: clickupTaskLinks.clickupTaskUrl,
      sprintListId: clickupTaskLinks.sprintListId,
    })
    .from(clickupTaskLinks)
    .where(
      and(
        eq(clickupTaskLinks.project, project),
        eq(clickupTaskLinks.normalizedTitle, normalizedTitle),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Cria o vínculo ou atualiza o existente (mesma tarefa, sprint pode ter mudado
 * com o carry over — RF-17). `onConflictDoUpdate` usa o índice único
 * `(project, normalized_title)`.
 */
export async function upsertTaskLink(input: {
  project: Project;
  normalizedTitle: string;
  clickupTaskId: string;
  clickupTaskUrl: string;
  sprintListId: string;
}): Promise<void> {
  await db
    .insert(clickupTaskLinks)
    .values({
      project: input.project,
      normalizedTitle: input.normalizedTitle,
      clickupTaskId: input.clickupTaskId,
      clickupTaskUrl: input.clickupTaskUrl,
      sprintListId: input.sprintListId,
    })
    .onConflictDoUpdate({
      target: [clickupTaskLinks.project, clickupTaskLinks.normalizedTitle],
      set: {
        clickupTaskId: input.clickupTaskId,
        clickupTaskUrl: input.clickupTaskUrl,
        sprintListId: input.sprintListId,
        updatedAt: new Date(),
      },
    });
}

/**
 * Remove o vínculo — usado quando a tarefa some no ClickUp (`TAREFA_SUMIU`) e o
 * índice local precisa esquecer para permitir recriar na próxima tentativa.
 */
export async function deleteTaskLink(
  project: Project,
  normalizedTitle: string,
): Promise<void> {
  await db
    .delete(clickupTaskLinks)
    .where(
      and(
        eq(clickupTaskLinks.project, project),
        eq(clickupTaskLinks.normalizedTitle, normalizedTitle),
      ),
    );
}
