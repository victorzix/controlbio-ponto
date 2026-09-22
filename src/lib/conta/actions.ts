"use server";

import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guard";
import { updateOwnAccountSchema } from "./validation";

export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Extrai o primeiro erro de cada campo de um ZodError. */
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

/** Mapeia violação de UNIQUE (condição de corrida) para o erro de campo. */
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
 * Autoatendimento: atualiza os dados da **própria** conta (spec 005).
 *
 * Exige apenas sessão válida (`requireUser`) — não é uma permissão de papel:
 * qualquer usuário pode editar o próprio perfil. O alvo é SEMPRE o usuário da
 * sessão; nenhum `id` vem do client (RN-01). Não altera papel nem valor/hora
 * (RN-02) — esses campos nem existem no schema desta tela.
 *
 * Senha é opcional: em branco mantém a atual; preenchida (≥ 8), troca o hash.
 */
export async function updateOwnAccount(input: unknown): Promise<ActionState> {
  const user = await requireUser();

  const parsed = updateOwnAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { name, username, email, password } = parsed.data;
  const emailValue = email && email.length > 0 ? email : null;

  // Unicidade do username, ignorando a própria conta (RN-03).
  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, user.id)))
    .limit(1);

  if (existingUsername.length > 0) {
    return { fieldErrors: { username: "Já existe um usuário com este login." } };
  }

  // Unicidade do e-mail (quando informado), ignorando a própria conta.
  if (emailValue) {
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, emailValue), ne(users.id, user.id)))
      .limit(1);

    if (existingEmail.length > 0) {
      return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
    }
  }

  const updateData: Partial<typeof users.$inferInsert> = {
    name,
    username,
    email: emailValue,
  };

  // Troca o hash apenas se uma nova senha válida foi informada (RF-04).
  if (password && password.length >= 8) {
    updateData.passwordHash = await hashPassword(password);
  }

  try {
    await db.update(users).set(updateData).where(eq(users.id, user.id));
  } catch (err) {
    return (
      uniqueViolation(err) ?? { error: "Erro ao salvar. Tente novamente." }
    );
  }

  return { ok: true };
}