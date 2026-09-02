import { requirePermission } from "@/lib/auth/guard";
import { PROJECT_OPTIONS, type Project } from "@/lib/ponto/validation";
import { getProjectConfigForEdit } from "@/lib/clickup/data";
import type { ProjectConfig } from "@/lib/clickup/config";
import { IntegracaoClient } from "./integracao-client";

/**
 * Tela de configuração da integração ClickUp (spec 011, Tarefa 13). Guarda de
 * leitura no servidor (`integracao:configurar`, só admin). A configuração
 * salva de cada projeto é buscada aqui (Server Component — CLAUDE.md §6) e
 * repassada como valor inicial; as listas encadeadas (Space/Folder/Lista/
 * status) são buscadas pelo client via React Query, porque dependem de
 * escolhas feitas na hora.
 */
export default async function IntegracaoPage() {
  await requirePermission("integracao:configurar");

  const initialConfigs: Partial<Record<Project, ProjectConfig>> = {};
  for (const { value } of PROJECT_OPTIONS) {
    initialConfigs[value] = (await getProjectConfigForEdit(value)) ?? undefined;
  }

  return <IntegracaoClient initialConfigs={initialConfigs} />;
}
