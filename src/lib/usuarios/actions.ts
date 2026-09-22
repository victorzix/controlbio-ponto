"use server";

import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, invalidateAllSessions } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guard";
import { createUserSchema, updateUserSchema } from "./validation";
import { listUsers, type UserListItem } from "./data";

/**
 * Leitura da lista de usuários para o client (React Query). Guarda no servidor:
 * exige `usuarios:ler`. Ver `CLAUDE.md` §6.
 */
export async function fetchUsers(q?: string): Promise<UserListItem[]> {
  await requirePermission("usuarios:ler");
  return listUsers(q);
}

export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

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
 * Mapeia uma violação de constraint UNIQUE (condição de corrida) para o erro de
 * campo correspondente. Retorna null se o erro não for de unicidade.
 */
function uniqueViolation(err: unknown): ActionState | null {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!message.includes("unique") && !message.includes("duplicate")) return null;
  if (message.includes("username")) {
    return { fieldErrors: { username: "Já existe um usuário com este login." } };
  }
  if (message.includes("email")) {
    return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
  }
  return { error: "Já existe um usuário com esses dados." };
}

/**
 * Cria um novo usuário.
 * Exige permissão "usuarios:criar" (apenas admin).
 */
export async function createUser(input: unknown): Promise<ActionState> {
  await requirePermission("usuarios:criar");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { name, username, email, role, password, hourlyRate } = parsed.data;
  const emailValue = email && email.length > 0 ? email : null;
  const hourlyRateCents =
    hourlyRate != null ? Math.round(hourlyRate * 100) : null;

  // Checa duplicidade de username (login) — RN-04
  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUsername.length > 0) {
    return { fieldErrors: { username: "Já existe um usuário com este login." } };
  }

  // Checa duplicidade de e-mail apenas quando informado
  if (emailValue) {
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailValue))
      .limit(1);

    if (existingEmail.length > 0) {
      return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
    }
  }

  const passwordHash = await hashPassword(password);

  try {
    await db.insert(users).values({
      name,
      username,
      email: emailValue,
      role,
      hourlyRateCents,
      passwordHash,
    });
  } catch (err) {
    return uniqueViolation(err) ?? { error: "Erro ao criar usuário. Tente novamente." };
  }

  return { ok: true };
}

/**
 * Atualiza dados de um usuário existente.
 * Exige permissão "usuarios:editar" (apenas admin).
 * RN-05: não altera o papel se o usuário estiver editando a própria conta.
 */
export async function updateUser(
  id: string,
  input: unknown,
): Promise<ActionState> {
  const currentUser = await requirePermission("usuarios:editar");

  if (typeof id !== "string" || !id) {
    return { error: "ID de usuário inválido." };
  }

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { name, username, email, role, password, hourlyRate } = parsed.data;
  const emailValue = email && email.length > 0 ? email : null;
  const hourlyRateCents =
    hourlyRate != null ? Math.round(hourlyRate * 100) : null;

  // Checa duplicidade de username excluindo o próprio usuário (RN-04)
  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, id)))
    .limit(1);

  if (existingUsername.length > 0) {
    return { fieldErrors: { username: "Já existe um usuário com este login." } };
  }

  // Checa duplicidade de e-mail (quando informado) excluindo o próprio usuário
  if (emailValue) {
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, emailValue), ne(users.id, id)))
      .limit(1);

    if (existingEmail.length > 0) {
      return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
    }
  }

  // Monta os campos a atualizar
  const updateData: Partial<typeof users.$inferInsert> = {
    name,
    username,
    email: emailValue,
    hourlyRateCents,
  };

  // RN-05: não altera o papel se for a própria conta
  if (id !== currentUser.id) {
    updateData.role = role;
  }

  // Atualiza o hash se senha preenchida
  if (password && password.length >= 8) {
    updateData.passwordHash = await hashPassword(password);
  }

  try {
    await db.update(users).set(updateData).where(eq(users.id, id));
  } catch (err) {
    return uniqueViolation(err) ?? { error: "Erro ao salvar usuário. Tente novamente." };
  }

  return { ok: true };
}

/**
 * Ativa ou desativa um usuário.
 * Exige permissão "usuarios:desativar" (apenas admin).
 * RN-05: não permite desativar a própria conta.
 * RF-05: ao desativar, revoga todas as sessões do usuário.
 */
export async function setUserActive(
  id: string,
  active: boolean,
): Promise<void> {
  const currentUser = await requirePermission("usuarios:desativar");

  // RN-05: bloqueia desativar a própria conta
  if (id === currentUser.id && active === false) {
    return;
  }

  await db.update(users).set({ active }).where(eq(users.id, id));

  if (!active) {
    await invalidateAllSessions(id);
  }
  // Sem redirect: o client invalida a query da lista (React Query) e atualiza.
}
