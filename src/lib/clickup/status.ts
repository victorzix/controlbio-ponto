import { normalizeTitle } from "./title";

/**
 * Classificação de status da tarefa — spec 011, RN-02/RN-03.
 *
 * Os folders do workspace usam nomes COMPLETAMENTE diferentes (`GPA` tem
 * "em andamento"/"em teste"; `RPA` tem "fazendo"/"homologando"), então a regra
 * se apoia no campo `type` que a API devolve, não no nome.
 */

export type ClickUpStatus = { id: string; status: string; type: string };
export type StatusClass = "parado" | "adiante" | "concluido";

export function classifyStatus(type: string): StatusClass {
  if (type === "open" || type === "unstarted") return "parado";
  if (type === "done" || type === "closed") return "concluido";
  // Desconhecido conta como "adiante": na dúvida, não mexer no board de ninguém.
  return "adiante";
}

/** Só tarefa parada vai para "em andamento" — nunca regredimos (RN-02). */
export function shouldMoveToInProgress(currentType: string): boolean {
  return classifyStatus(currentType) === "parado";
}

/** Busca tolerante a caixa e acento — o admin digita/escolhe o nome exibido. */
export function findStatusByName(
  statuses: ClickUpStatus[],
  name: string,
): ClickUpStatus | null {
  const target = normalizeTitle(name);
  return statuses.find((s) => normalizeTitle(s.status) === target) ?? null;
}

export type StatusConfigIssue = {
  field: "inProgressStatus" | "doneStatus";
  status: string;
};

/**
 * Confere se os status configurados (andamento/obrigatório; conclusão/
 * opcional) existem na Lista de **destino** informada — spec 011, Tarefa 13
 * (fix de review). Existe porque a tela de configuração lista as opções de
 * status a partir da Lista de **backlog** (é a única Lista que o admin já
 * escolheu naquele ponto do formulário), mas o pipeline aplica esses status
 * na Lista de destino resolvida por `pickSprintList` — normalmente uma
 * sprint, não o backlog. Neste workspace o conjunto de status não é
 * uniforme entre Listas de um mesmo Folder (algumas herdam do Folder,
 * outras têm override por Lista), então um status válido no backlog pode
 * não existir na sprint — e `updateTask`/`createTask` falhariam com 400 em
 * produção sem aviso nenhum. Usa `findStatusByName` para a mesma comparação
 * tolerante a caixa/acento que o pipeline já faz.
 */
export function findMissingConfiguredStatuses(
  destinationStatuses: ClickUpStatus[],
  config: { inProgressStatus: string; doneStatus: string | null },
): StatusConfigIssue[] {
  const issues: StatusConfigIssue[] = [];

  if (!findStatusByName(destinationStatuses, config.inProgressStatus)) {
    issues.push({
      field: "inProgressStatus",
      status: config.inProgressStatus,
    });
  }

  if (
    config.doneStatus &&
    !findStatusByName(destinationStatuses, config.doneStatus)
  ) {
    issues.push({ field: "doneStatus", status: config.doneStatus });
  }

  return issues;
}
