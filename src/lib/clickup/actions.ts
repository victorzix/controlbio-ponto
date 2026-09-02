"use server";

/**
 * Server Actions da tela `/integracao` (spec 011, Tarefa 13). **Toda** ação
 * exige `requirePermission("integracao:configurar")` antes de qualquer coisa —
 * é a única porta de entrada para ler/escrever a configuração do ClickUp.
 */
import { requirePermission } from "@/lib/auth/guard";
import type { Project } from "@/lib/ponto/validation";
import { todayBrasiliaISO } from "@/lib/tz";
import { getServiceClient, getProjectConfigForEdit } from "./data";
import { upsertProjectConfig, type ProjectConfig } from "./config";
import { listMembers, type ClickUpMember } from "./members";
import { countFailedJobs } from "./queue";
import { pickSprintList, type ClickUpList, type SprintPick } from "./sprint";
import { findMissingConfiguredStatuses, type ClickUpStatus } from "./status";
import { projectConfigSchema } from "./validation";

/** Item simples de picker (Space/Folder). */
export type ClickUpOption = { id: string; name: string };

export type ConnectionStatus =
  | { configured: false; failedJobs: number }
  | {
      configured: true;
      ok: true;
      username: string;
      email: string;
      failedJobs: number;
    }
  | { configured: true; ok: false; error: string; failedJobs: number };

/**
 * Status da conexão: há token de serviço configurado? Se sim, quem é (RF-19
 * usa isso pro cabeçalho da tela)? Junto, o contador de jobs com falha
 * (`countFailedJobs`) — pendências que o admin precisa resolver.
 */
export async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  await requirePermission("integracao:configurar");

  const failedJobs = await countFailedJobs();
  const client = getServiceClient();
  if (!client) return { configured: false, failedJobs };

  try {
    const user = await client.getCurrentUser();
    return {
      configured: true,
      ok: true,
      username: user.username,
      email: user.email,
      failedJobs,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido.",
      failedJobs,
    };
  }
}

/** Lança se não houver token de serviço configurado no ambiente. */
function requireServiceClient() {
  const client = getServiceClient();
  if (!client) {
    throw new Error(
      "Integração ClickUp não configurada neste ambiente (token/time ausente).",
    );
  }
  return client;
}

/** Picker 1: Spaces do workspace. */
export async function fetchSpaces(): Promise<ClickUpOption[]> {
  await requirePermission("integracao:configurar");
  const client = requireServiceClient();
  return client.getSpaces();
}

/** Picker 2: Folders de um Space. */
export async function fetchFolders(spaceId: string): Promise<ClickUpOption[]> {
  await requirePermission("integracao:configurar");
  const client = requireServiceClient();
  return client.getFolders(spaceId);
}

/** Picker 3: Listas (sprints + backlog) de um Folder. */
export async function fetchLists(folderId: string): Promise<ClickUpList[]> {
  await requirePermission("integracao:configurar");
  const client = requireServiceClient();
  return client.getLists(folderId);
}

/** Pickers 4/5: Status disponíveis numa Lista (andamento/conclusão). */
export async function fetchListStatuses(
  listId: string,
): Promise<ClickUpStatus[]> {
  await requirePermission("integracao:configurar");
  const client = requireServiceClient();
  return client.getListStatuses(listId);
}

/**
 * Resultado de `fetchMembers` — mesmo formato de `ConnectionStatus`
 * (`configured`/`ok` separados): sem token configurado não é um "erro" a
 * lançar, é um estado normal do ambiente (dev/testes sem credencial), e o
 * formulário de usuário (Tarefa 14) precisa distinguir isso de uma falha real
 * na chamada para degradar de forma diferente em cada caso.
 */
export type FetchMembersResult =
  | { configured: false }
  | { configured: true; ok: true; members: ClickUpMember[] }
  | { configured: true; ok: false; error: string };

/**
 * Membros do workspace, para o `<select>` de vínculo do usuário com o
 * ClickUp (spec 011, Tarefa 14, RF-12). Guarda com `usuarios:editar`: quem
 * acessa esta lista é o formulário de usuário (criar/editar), não a tela de
 * integração — `criar`/`editar` são permissões só de admin, então o guard
 * cobre os dois modos do formulário.
 */
export async function fetchMembers(): Promise<FetchMembersResult> {
  await requirePermission("usuarios:editar");

  const client = getServiceClient();
  if (!client) return { configured: false };

  try {
    const members = await listMembers(client);
    return { configured: true, ok: true, members };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao consultar o ClickUp.",
    };
  }
}

export type SaveConfigResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

/** Extrai erros por campo de um ZodError (primeiro erro de cada campo). */
function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Salva a configuração de um projeto. **Revalida `projectConfigSchema` no
 * servidor** (CLAUDE.md §7) — nunca confia que o client mandou algo válido,
 * mesmo com o `zodResolver` já validando lá.
 */
export async function saveProjectConfig(
  input: unknown,
): Promise<SaveConfigResult> {
  const currentUser = await requirePermission("integracao:configurar");

  const parsed = projectConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const data = parsed.data;
  const config: ProjectConfig = {
    project: data.project,
    spaceId: data.spaceId,
    folderId: data.folderId,
    backlogListId: data.backlogListId,
    inProgressStatus: data.inProgressStatus,
    doneStatus: data.doneStatus.length > 0 ? data.doneStatus : null,
    sprintDateFormat: data.sprintDateFormat,
    enabled: data.enabled,
  };

  try {
    await upsertProjectConfig(config, currentUser.id);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.",
    };
  }

  return { ok: true };
}

export type TestConfigResult =
  | {
      ok: true;
      listName: string;
      source: SprintPick["source"];
      /**
       * Avisos de status ausente na Lista de **destino** (não na de backlog,
       * de onde vêm as opções dos pickers). Vazio = os dois status existem
       * lá. Ver comentário abaixo sobre por que essa checagem existe.
       */
      statusIssues: string[];
    }
  | { ok: false; error: string };

/**
 * Botão "testar" (RF-19, CA-13): carrega a configuração salva do projeto,
 * busca as Listas do Folder e roda `pickSprintList` com a data de **hoje em
 * Brasília** (`todayBrasiliaISO` — nunca `todayISODate`, que usa o fuso do
 * servidor). Devolve o nome da Lista escolhida e como isso foi decidido.
 *
 * Também valida os status: os pickers de "em andamento"/"concluído" listam
 * status da Lista de **backlog** (é a única Lista que o admin necessariamente
 * já escolheu quando chega neles), mas o pipeline aplica esses status na
 * Lista de **destino** resolvida por `pickSprintList` — normalmente uma
 * sprint, não o backlog. Nesse workspace o conjunto de status **não** é
 * uniforme: um Folder herda o status do próprio Folder (`cat_<folderId>`)
 * para todas as Listas, outro tem sprints com override por Lista
 * (`status_group: subcat_<listId>`) — nesse segundo caso, um status que
 * existe no backlog pode não existir na sprint, e `updateTask` falharia com
 * 400 em produção sem que a tela tivesse avisado nada. Por isso: busca os
 * status da Lista de destino de verdade e confere com `findStatusByName`
 * (mesma comparação tolerante a caixa/acento que o pipeline usa).
 */
export async function testProjectConfig(
  project: Project,
): Promise<TestConfigResult> {
  await requirePermission("integracao:configurar");

  const config = await getProjectConfigForEdit(project);
  if (!config) {
    return {
      ok: false,
      error: "Salve a configuração do projeto antes de testar.",
    };
  }

  let client;
  try {
    client = requireServiceClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Integração não configurada.",
    };
  }

  try {
    const lists = await client.getLists(config.folderId);
    const today = todayBrasiliaISO();
    const pick = pickSprintList(
      lists,
      today,
      config.sprintDateFormat,
      config.backlogListId,
    );
    const list = lists.find((l) => l.id === pick.listId);
    const listName = list?.name ?? pick.listId;

    // Status da Lista de DESTINO (a que `pickSprintList` resolveu) — não da
    // Lista de backlog de onde vieram as opções dos pickers (ver
    // `findMissingConfiguredStatuses` em status.ts para o porquê).
    const destinationStatuses = await client.getListStatuses(pick.listId);
    const missing = findMissingConfiguredStatuses(destinationStatuses, {
      inProgressStatus: config.inProgressStatus,
      doneStatus: config.doneStatus,
    });
    const statusIssues = missing.map((m) =>
      m.field === "inProgressStatus"
        ? `O status de andamento "${m.status}" não existe na Lista "${listName}".`
        : `O status de conclusão "${m.status}" não existe na Lista "${listName}".`,
    );

    return { ok: true, listName, source: pick.source, statusIssues };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao consultar o ClickUp.",
    };
  }
}
