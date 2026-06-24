import { requirePermission } from "@/lib/auth/guard";
import { UserForm } from "../user-form";

/** Página de criação de novo usuário. Apenas admin. */
export default async function NovoUsuarioPage() {
  await requirePermission("usuarios:criar");

  return (
    <div className="flex justify-center">
      <UserForm mode="create" />
    </div>
  );
}
