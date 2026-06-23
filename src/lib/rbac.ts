import type { UserRole } from "@/db/schema";

/**
 * RBAC baseado em código (não há tabela de permissões no banco).
 *
 * Fluxo: cada `UserRole` mapeia para um conjunto de `Permission`.
 * Use `can(role, permission)` para checar acesso em rotas/server actions.
 *
 * Para adicionar uma permissão nova: inclua na lista `PERMISSIONS` e
 * distribua nos papéis em `ROLE_PERMISSIONS`.
 */
export const PERMISSIONS = [
  // Ponto
  "ponto:registrar", // bater o próprio ponto
  "ponto:ver_proprio", // ver os próprios registros
  "ponto:ver_equipe", // ver registros da equipe
  "ponto:ajustar", // solicitar/aprovar ajustes de ponto
  // Usuários
  "usuarios:ler",
  "usuarios:criar",
  "usuarios:editar",
  "usuarios:desativar",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ALL,
  gestor: [
    "ponto:registrar",
    "ponto:ver_proprio",
    "ponto:ver_equipe",
    "ponto:ajustar",
    "usuarios:ler",
  ],
  funcionario: ["ponto:registrar", "ponto:ver_proprio"],
};

/** Retorna true se o papel possui a permissão. */
export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Versão que lança erro — útil em server actions / route handlers. */
export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Acesso negado: papel "${role}" não tem "${permission}".`);
  }
}