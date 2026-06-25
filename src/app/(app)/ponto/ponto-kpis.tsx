import { Clock, Wallet } from "lucide-react";
import { formatWorkedMinutes } from "@/lib/ponto/validation";
import { cn } from "@/lib/utils";

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Valor estimado (centavos) = minutos × valor/hora(centavos) ÷ 60. */
function estimateCents(minutes: number, rateCents: number | null): number | null {
  return rateCents != null ? Math.round((minutes * rateCents) / 60) : null;
}

function formatCents(cents: number | null): string {
  return cents != null ? brlFmt.format(cents / 100) : "—";
}

type KpiProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
  hint?: string;
};

function Kpi({ label, value, icon, valueClassName, hint }: KpiProps) {
  return (
    <div className="bg-card border-border flex flex-col gap-1 rounded-lg border p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight", valueClassName)}>
        {value}
      </p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

type PontoKpisProps = {
  totalMinutes: number;
  hourlyRateCents: number | null;
};

/** Painel de indicadores do ponto. Os totais acompanharão os filtros da lista. */
export function PontoKpis({ totalMinutes, hourlyRateCents }: PontoKpisProps) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <Kpi
        label="Horas feitas"
        value={formatWorkedMinutes(totalMinutes)}
        icon={<Clock className="size-4" />}
      />
      <Kpi
        label="Valor estimado"
        value={formatCents(estimateCents(totalMinutes, hourlyRateCents))}
        icon={<Wallet className="text-primary size-4" />}
        valueClassName="text-primary"
        hint={
          hourlyRateCents != null
            ? `${brlFmt.format(hourlyRateCents / 100)}/h`
            : "defina o valor/hora no usuário"
        }
      />
    </section>
  );
}
