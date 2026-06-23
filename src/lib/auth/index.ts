import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, validateSession, type SessionUser } from "./session";

/**
 * Resolve o usuário autenticado a partir do cookie de sessão.
 * É a base de autorização das demais features (combinar com `can()`/`assertCan()`).
 * Retorna `null` se não houver sessão válida (anônimo/expirado/revogado/inativo).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSession(token);
}

export * from "./session";
export * from "./password";
export * from "./validation";
