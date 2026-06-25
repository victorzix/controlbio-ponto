import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AppSidebar } from "@/components/app-sidebar";

/**
 * Layout da área interna. Guarda autoritativa de sessão (RF-06): valida no banco
 * via getCurrentUser() e redireciona ao login se não houver sessão válida.
 *
 * Navegação por sidebar (`AppSidebar`): fixa no desktop, drawer no mobile.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canReadUsuarios = can(user.role, "usuarios:ler");
  const canVerPonto = can(user.role, "ponto:ver_proprio");

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppSidebar
        userName={user.name}
        canVerPonto={canVerPonto}
        canReadUsuarios={canReadUsuarios}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
