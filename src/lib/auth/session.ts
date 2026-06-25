import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import type { UserRole } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "./cookie";

export { SESSION_COOKIE_NAME };

/** Duração da sessão em segundos (default 8h — uma jornada). RN-04. */
const RAW_MAX_AGE = Number(process.env.SESSION_MAX_AGE);
export const SESSION_MAX_AGE =
  Number.isFinite(RAW_MAX_AGE) && RAW_MAX_AGE > 0 ? RAW_MAX_AGE : 28800;

/** Usuário resolvido a partir de uma sessão válida. */
export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: UserRole;
};

/** O cookie guarda o token em claro; o banco guarda só o SHA-256 dele. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cria uma sessão para o usuário e devolve o token (a ser posto no cookie). */
export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await db.insert(sessions).values({
    tokenHash,
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 255),
  });

  return { token, expiresAt };
}

/**
 * Valida o token de sessão. Retorna o usuário se a sessão existe, não expirou
 * e o usuário está ativo (RN-02). Faz limpeza preguiçosa de sessão expirada.
 */
export async function validateSession(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      active: users.active,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  if (!row.active) return null;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
  };
}

/** Revoga uma sessão específica (logout). RN-05. */
export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Revoga todas as sessões de um usuário (ex.: ao desativar a conta). */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
