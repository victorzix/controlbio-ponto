/**
 * Normalização do identificador de login (username) — spec 004-login-por-nome.
 *
 * O login é o primeiro nome da pessoa, sempre em minúsculas, sem acentos e
 * apenas com caracteres `a-z0-9`. A mesma normalização vale tanto para derivar
 * o username a partir do nome quanto para o texto digitado na tela de login —
 * assim `Andrey`, `ANDREY`, `andrey` e `Andréy` resolvem todos para `andrey`.
 */

/**
 * Reduz um texto à forma canônica do username:
 * separa os diacríticos (NFD) e os remove, passa a minúsculas e descarta
 * tudo que não é a-z0-9.
 */
function normalizeToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Deriva o username sugerido a partir do **primeiro token** do nome completo. */
export function deriveUsernameFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return normalizeToken(first);
}

/** Normaliza o que o usuário digitou no campo de login. */
export function normalizeUsernameInput(raw: string): string {
  return normalizeToken(raw);
}
