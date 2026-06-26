import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { todayISODate } from "@/lib/ponto/validation";
import { listReportUsers } from "@/lib/relatorios/data";
import { RelatoriosView } from "./relatorios-view";

/**
 * Home da área interna — é a tela de **Relatórios** do admin (spec 006).
 * Funcionário não tem relatório de equipe: é levado direto ao seu ponto.
 */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "ponto:ver_equipe")) redirect("/ponto");

  const users = await listReportUsers();

  return <RelatoriosView users={users} today={todayISODate()} />;
}