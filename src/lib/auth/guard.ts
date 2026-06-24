import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./index";
import { can, type Permission } from "@/lib/rbac";

/**
 * Exige usuário autenticado. Redireciona para /login se não houver sessão válida.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige permissão específica. Redireciona para / se o papel não tiver a permissão.
 * Retorna o usuário autenticado para uso imediato.
 */
export async function requirePermission(p: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, p)) redirect("/");
  return user;
}
