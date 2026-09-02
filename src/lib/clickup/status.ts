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
