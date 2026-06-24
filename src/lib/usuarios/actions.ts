"use server";

import { redirect } from "next/navigation";
import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, invalidateAllSessions } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/guard";
import { createUserSchema, updateUserSchema } from "./validation";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Cria um novo usuário.
 * Exige permissão "usuarios:criar" (apenas admin).
 */
export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("usuarios:criar");

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  };

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { name, email, role, password } = parsed.data;

  // Checa duplicidade de e-mail
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
  }

  const passwordHash = await hashPassword(password);

  try {
    await db.insert(users).values({ name, email, role, passwordHash });
  } catch (err) {
    // Trata violação de unique (condição de corrida)
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
    }
    return { error: "Erro ao criar usuário. Tente novamente." };
  }

  redirect("/usuarios?ok=criado");
}

/**
 * Atualiza dados de um usuário existente.
 * Exige permissão "usuarios:editar" (apenas admin).
 * RN-05: não altera o papel se o usuário estiver editando a própria conta.
 */
export async function updateUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const currentUser = await requirePermission("usuarios:editar");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "ID de usuário inválido." };
  }

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  };

  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const { name, email, role, password } = parsed.data;

  // Checa duplicidade de e-mail excluindo o próprio usuário
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, id)))
    .limit(1);

  if (existing.length > 0) {
    return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
  }

  // Monta os campos a atualizar
  const updateData: Partial<typeof users.$inferInsert> = { name, email };

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
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { fieldErrors: { email: "Já existe um usuário com este e-mail." } };
    }
    return { error: "Erro ao salvar usuário. Tente novamente." };
  }

  redirect("/usuarios?ok=salvo");
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

  redirect("/usuarios?ok=status");
}
