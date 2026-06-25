import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/rbac";
import { UsuariosClient } from "./usuarios-client";

/** Área de usuários. Guarda de leitura no servidor; o resto é SPA (React Query). */
export default async function UsuariosPage() {
  const currentUser = await requirePermission("usuarios:ler");
  const isAdmin = can(currentUser.role, "usuarios:criar");

  return <UsuariosClient currentUserId={currentUser.id} isAdmin={isAdmin} />;
}
