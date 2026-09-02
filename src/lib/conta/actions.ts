"use server";

import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guard";
import { createClickUpClient } from "@/lib/clickup/client";
import { encryptToken } from "@/lib/clickup/crypto";
import { connectClickUpSchema, updateOwnAccountSchema } from "./validation";

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

/**
 * Conecta o token pessoal do ClickUp da **própria** conta (spec 011, Tarefa 15,
 * RN-12). Alvo é sempre o usuário da sessão (`requireUser`) — nenhum `id` vem
 * do client, então uma pessoa nunca consegue conectar/desconectar a conta de
 * outra.
 *
 * Ordem importa por segurança: só cifra e grava DEPOIS de provar, com uma
 * chamada real (`GET /v2/user` via `getCurrentUser`), que o token informado
 * autentica. Um token que não funciona é rejeitado como erro de campo — nunca
 * chega a ser persistido, nem em claro nem cifrado.
 *
 * Sem `CLICKUP_TOKEN_ENC_KEY` configurada (ou malformada), a conexão falha
 * pedindo para contatar o admin. Não existe fallback que grave o token sem
 * cifra — regra dura (RNF de segurança).
 */
export async function connectClickUp(input: unknown): Promise<ActionState> {
  const user = await requireUser();

  const parsed = connectClickUpSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const encKey = process.env.CLICKUP_TOKEN_ENC_KEY;
  if (!encKey) {
    return {
      error:
        "A integração com o ClickUp não está configurada neste ambiente. Fale com o administrador.",
    };
  }

  const { token } = parsed.data;

  // Prova que o token realmente autentica ANTES de gravar qualquer coisa.
  // `teamId` não é usado por `getCurrentUser` — só é exigido pelo tipo do
  // cliente, então uma string vazia aqui não afeta esta chamada.
  const client = createClickUpClient({
    token,
    teamId: process.env.CLICKUP_TEAM_ID ?? "",
  });

  let clickUpUser: { username: string; email: string };
  try {
    clickUpUser = await client.getCurrentUser();
  } catch {
    // Nunca logar o token nem o corpo do erro (pode ecoar o token na mensagem).
    return {
      fieldErrors: {
        token: "Token inválido ou sem permissão. Confira e tente novamente.",
      },
    };
  }

  const label = clickUpUser.username || clickUpUser.email || "Conta ClickUp";

  let tokenEnc: string;
  try {
    tokenEnc = encryptToken(token, encKey);
  } catch {
    // Chave malformada (ex.: tamanho errado) — nunca cair para gravar em claro.
    return {
      error:
        "Não foi possível cifrar o token (chave de cifra inválida). Fale com o administrador.",
    };
  }

  try {
    await db
      .update(users)
      .set({ clickupTokenEnc: tokenEnc, clickupTokenLabel: label })
      .where(eq(users.id, user.id));
  } catch {
    // Nunca logar `err` aqui: numa falha de banco (ex.: violação de tamanho de
    // coluna) a mensagem do driver pode ecoar o valor rejeitado — que é a
    // CIFRA do token, não o texto em claro, mas ainda assim não deve vazar.
    return { error: "Erro ao salvar. Tente novamente." };
  }

  return { ok: true };
}

/**
 * Desconecta o token pessoal do ClickUp da **própria** conta. Zera as duas
 * colunas — nada fica cifrado "órfão" no banco depois de desconectar.
 */
export async function disconnectClickUp(): Promise<ActionState> {
  const user = await requireUser();

  try {
    await db
      .update(users)
      .set({ clickupTokenEnc: null, clickupTokenLabel: null })
      .where(eq(users.id, user.id));
  } catch {
    return { error: "Erro ao salvar. Tente novamente." };
  }

  return { ok: true };
}