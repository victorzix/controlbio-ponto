import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * Home da área interna — só faz sentido para **admin**. Funcionário não tem
 * "início": é levado direto ao seu ponto.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "usuarios:ler")) redirect("/ponto");

  const firstName = user.name.split(" ")[0] ?? "";

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Olá, {firstName} 👋
      </h1>
      <p className="text-muted-foreground">
        Use o menu para gerenciar usuários e acompanhar os registros de ponto.
      </p>
    </div>
  );
}
