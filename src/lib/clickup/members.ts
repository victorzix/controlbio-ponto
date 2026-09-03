/**
 * Vínculo usuário ↔ membro do ClickUp (spec 011, Tarefa 14, RF-12/RN-09).
 *
 * `listMembers` é só um repasse fino para `client.getMembers()` — fica aqui,
 * e não direto em `actions.ts`, para viver perto de `suggestMemberFor`, que é
 * a lógica de fato interessante (e testável) deste módulo.
 */
import { normalizeTitle } from "./title";

/**
 * Membro do workspace, como devolvido por `client.getMembers()`.
 *
 * O tipo de `ClickUpClient` promete `email: string`, mas o exemplo do objeto
 * `user` na documentação da API do ClickUp **não mostra esse campo** — na
 * prática ele pode vir ausente. Por isso aqui o e-mail é opcional: tratar
 * como sempre presente faria `suggestMemberFor` comparar `undefined` com
 * `undefined` e declarar "match" por engano (o risco identificado na revisão
 * da Tarefa 8).
 */
export type ClickUpMember = {
  id: number;
  username: string;
  email?: string;
};

/** Lado da aplicação de `suggestMemberFor` — o mínimo que a sugestão precisa. */
export type AppUserForSuggestion = {
  name: string;
  /** `users.email` é opcional nesta aplicação (login é por username — spec 004). */
  email?: string | null;
};

/** Busca os membros do workspace configurado no cliente do ClickUp. */
export async function listMembers(client: {
  getMembers(): Promise<ClickUpMember[]>;
}): Promise<ClickUpMember[]> {
  return client.getMembers();
}

/**
 * Normaliza um e-mail para comparação (trim + minúsculas) e trata string
 * vazia/só espaços como **ausente** — nunca como um valor comparável.
 */
function normalizedEmailOrNull(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Sugere qual membro do workspace corresponde a um usuário da aplicação —
 * é a pré-seleção que o formulário de usuário usa (RF-12).
 *
 * Ordem de match: e-mail exato primeiro; na falta (ou ausência) de e-mail,
 * nome normalizado com `normalizeTitle` (mesma normalização usada no resto
 * da integração, tolerante a acento/caixa).
 *
 * **Nunca casa por e-mail quando um dos dois lados não tem e-mail.** Nem
 * `users.email` (opcional nesta aplicação) nem `ClickUpMember.email` (pode
 * vir ausente na resposta real da API) podem virar "match" por omissão em
 * ambos, nem um lado ausente pode "casar" com o outro presente.
 */
export function suggestMemberFor(
  user: AppUserForSuggestion,
  members: ClickUpMember[],
): ClickUpMember | null {
  const userEmail = normalizedEmailOrNull(user.email);
  if (userEmail) {
    const byEmail = members.find(
      (m) => normalizedEmailOrNull(m.email) === userEmail,
    );
    if (byEmail) return byEmail;
  }

  const userName = normalizeTitle(user.name);
  if (userName) {
    const byName = members.find((m) => normalizeTitle(m.username) === userName);
    if (byName) return byName;
  }

  return null;
}
