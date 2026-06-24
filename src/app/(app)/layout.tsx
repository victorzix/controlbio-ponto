import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

/**
 * Layout da área interna. Guarda autoritativa de sessão (RF-06): valida no banco
 * via getCurrentUser() e redireciona ao login se não houver sessão válida.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canReadUsuarios = can(user.role, "usuarios:ler");
  const canVerPonto = can(user.role, "ponto:ver_proprio");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold tracking-tight">
              controlbio <span className="text-muted-foreground">· ponto</span>
            </span>
            {/* Navegação principal */}
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground min-h-[44px] inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors"
              >
                Início
              </Link>
              {canVerPonto ? (
                <Link
                  href="/ponto"
                  className="text-muted-foreground hover:text-foreground min-h-[44px] inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors"
                >
                  Ponto
                </Link>
              ) : null}
              {canReadUsuarios ? (
                <Link
                  href="/usuarios"
                  className="text-muted-foreground hover:text-foreground min-h-[44px] inline-flex items-center rounded-md px-3 text-sm font-medium transition-colors"
                >
                  Usuários
                </Link>
              ) : null}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name}
            </span>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm" className="gap-2">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
