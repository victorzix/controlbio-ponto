import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/rbac";
import { getOwnHourlyRateCents } from "@/lib/ponto/data";
import { todayISODate } from "@/lib/ponto/validation";
import { PontoView } from "./ponto-view";

/** Guarda de leitura no servidor; lista/KPIs/filtros são SPA (React Query). */
export default async function PontoPage() {
  const user = await requirePermission("ponto:ver_proprio");
  const hourlyRateCents = await getOwnHourlyRateCents(user.id);

  return (
    <PontoView
      userId={user.id}
      today={todayISODate()}
      hourlyRateCents={hourlyRateCents}
      canRegister={can(user.role, "ponto:registrar")}
      canEdit={can(user.role, "ponto:editar")}
      canDelete={can(user.role, "ponto:excluir")}
      canReplicate={can(user.role, "ponto:registrar")}
    />
  );
}
