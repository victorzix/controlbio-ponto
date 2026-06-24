import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { getUserById } from "@/lib/usuarios/data";
import { UserForm } from "../user-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Página de edição de usuário. Apenas admin. */
export default async function EditarUsuarioPage({ params }: PageProps) {
  const currentUser = await requirePermission("usuarios:editar");
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) notFound();

  const isSelf = id === currentUser.id;

  return (
    <div className="flex justify-center">
      <UserForm mode="edit" user={user} isSelf={isSelf} />
    </div>
  );
}
