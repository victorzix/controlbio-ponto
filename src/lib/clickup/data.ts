/**
 * Leituras da tela `/integracao` que não são Server Actions — funções puras/db
 * chamadas tanto pelo Server Component (`page.tsx`) quanto por `actions.ts`.
 * Sem guarda de permissão aqui: quem chama já garantiu `requirePermission`
 * (mesmo padrão de `src/lib/usuarios/data.ts`).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clickupProjectConfig } from "@/db/schema";
import type { Project } from "@/lib/ponto/validation";
import { createClickUpClient, type ClickUpClient } from "./client";
import type { ProjectConfig } from "./config";
import type { SprintDateFormat } from "./sprint";

/**
 * Cliente ClickUp autenticado com o **token de serviço** (variáveis de
 * ambiente — mesmas do worker, `src/worker/clickup-sync.ts`). `null` quando a
 * integração não está configurada no ambiente: a tela mostra "não configurado"
 * em vez de tentar falar com uma API sem credencial.
 */
export function getServiceClient(): ClickUpClient | null {
  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) return null;

  return createClickUpClient({
    token,
    teamId,
    perMinute: Number(process.env.CLICKUP_RATE_LIMIT_PER_MIN ?? 90),
  });
}

/**
 * Busca a configuração do projeto **para edição** — ao contrário de
 * `getProjectConfig` (config.ts, usado pelo pipeline), devolve a linha mesmo
 * quando `enabled` é `false`: a tela precisa mostrar o que já foi configurado
 * para o admin poder reativar, não só tratá-lo como "nunca configurado".
 */
export async function getProjectConfigForEdit(
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
  if (!row) return null;

  return {
    ...row,
    sprintDateFormat: row.sprintDateFormat as SprintDateFormat,
  };
}
