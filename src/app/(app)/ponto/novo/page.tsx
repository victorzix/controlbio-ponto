import { requirePermission } from "@/lib/auth/guard";
import { todayISODate } from "@/lib/ponto/validation";
import { PontoForm } from "../ponto-form";

/** Tela de novo registro de ponto. Qualquer usuário autenticado pode registrar. */
export default async function NovoPontoPage() {
  await requirePermission("ponto:registrar");
  return (
    <div className="flex justify-center">
      <PontoForm today={todayISODate()} />
    </div>
  );
}
