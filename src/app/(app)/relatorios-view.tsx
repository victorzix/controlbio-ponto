"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Download, RefreshCw, Wallet } from "lucide-react";
import { fetchReport } from "@/lib/relatorios/actions";
import type { ReportRow, ReportUserOption } from "@/lib/relatorios/data";
import { getMonthRange, getWeekRange } from "@/lib/ponto/dates";
import { formatWorkedMinutes } from "@/lib/ponto/validation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DateRangeField } from "@/components/ui/date-range-field";
import { cn } from "@/lib/utils";
import { UserMultiSelect } from "./user-multiselect";

type Preset = "week" | "month" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "custom", label: "Intervalo" },
];

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const dateFmt = new Intl.DateTimeFormat("pt-BR");

/** Valor estimado (centavos) = minutos × valor/hora(centavos) ÷ 60 (RN-01). */
function estimateCents(minutes: number, rateCents: number | null): number | null {
  return rateCents != null ? Math.round((minutes * rateCents) / 60) : null;
}

function formatCents(cents: number | null): string {
  return cents != null ? brlFmt.format(cents / 100) : "—";
}

/** Rótulo do mês "YYYY-MM" → "Junho de 2026" (capitalizado). */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const label = monthFmt.format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Data limite de "YYYY-MM" = 1º do mês seguinte (RN-02), "dd/MM/yyyy". */
function dueDateLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // m é 1-based; new Date(y, m, 1) já aponta o 1º dia do mês seguinte.
  return dateFmt.format(new Date(y, m, 1));
}

type UserLine = {
  userId: string;
  name: string;
  minutes: number;
  valueCents: number | null;
};

type MonthBlock = {
  month: string;
  totalMinutes: number;
  totalValueCents: number;
  users: UserLine[];
};

/** Agrupa as linhas agregadas por mês (cronológico crescente). */
function buildMonthBlocks(rows: ReportRow[]): MonthBlock[] {
  const byMonth = new Map<string, MonthBlock>();

  for (const r of rows) {
    let block = byMonth.get(r.month);
    if (!block) {
      block = { month: r.month, totalMinutes: 0, totalValueCents: 0, users: [] };
      byMonth.set(r.month, block);
    }
    const valueCents = estimateCents(r.totalMinutes, r.hourlyRateCents);
    block.users.push({
      userId: r.userId,
      name: r.name,
      minutes: r.totalMinutes,
      valueCents,
    });
    block.totalMinutes += r.totalMinutes;
    if (valueCents != null) block.totalValueCents += valueCents;
  }

  const blocks = [...byMonth.values()];
  blocks.sort((a, b) => a.month.localeCompare(b.month));
  for (const b of blocks) b.users.sort((u1, u2) => u1.name.localeCompare(u2.name));
  return blocks;
}

type Props = {
  users: ReportUserOption[];
  today: string;
};

/**
 * Relatórios (admin): horas e valor estimado da equipe por período e por usuário,
 * agrupados por mês com a data limite de pagamento. Filtros via React Query
 * (`CLAUDE.md` §6). Ver spec 006-relatorios.
 */
export function RelatoriosView({ users, today }: Props) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(() => getMonthRange(today).from);
  const [customTo, setCustomTo] = useState(today);
  // Default: todos os usuários ativos selecionados (RF-03).
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    users.filter((u) => u.active).map((u) => u.id),
  );

  const range = useMemo(() => {
    if (preset === "week") return getWeekRange(today);
    if (preset === "month") return getMonthRange(today);
    return customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : { from: customTo, to: customFrom };
  }, [preset, customFrom, customTo, today]);

  const sortedIds = useMemo(() => [...selectedIds].sort(), [selectedIds]);

  const {
    data: rows = [],
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["relatorios", range.from, range.to, sortedIds],
    queryFn: () => fetchReport(range, selectedIds),
    placeholderData: keepPreviousData,
    enabled: selectedIds.length > 0,
  });

  const blocks = useMemo(() => buildMonthBlocks(rows), [rows]);

  /** Baixa o .xlsx das entradas do período/seleção atuais (rota protegida). */
  function exportXlsx() {
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      users: selectedIds.join(","),
    });
    window.location.href = `/api/relatorios/export?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Relatórios
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => refetch()}
            disabled={selectedIds.length === 0 || isFetching}
            aria-label="Atualizar"
            title="Atualizar"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={exportXlsx}
            disabled={selectedIds.length === 0 || rows.length === 0}
          >
            <Download className="size-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Filtros: período + usuários */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Período"
          className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto"
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                preset === p.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <DateRangeField
            from={customFrom}
            to={customTo}
            onChange={(r) => {
              setCustomFrom(r.from);
              setCustomTo(r.to);
            }}
          />
        ) : null}

        <UserMultiSelect
          users={users}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
        />
      </div>

      {/* Conteúdo */}
      {selectedIds.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          Selecione ao menos um usuário.
        </div>
      ) : isPending ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Carregando...
        </p>
      ) : blocks.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          Nenhuma hora no período.
        </div>
      ) : (
        <div className="space-y-8">
          {blocks.map((block) => (
            <MonthSection key={block.month} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Bloco de um mês: cabeçalho + data limite, KPIs e detalhamento por usuário. */
function MonthSection({ block }: { block: MonthBlock }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{monthLabel(block.month)}</h2>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CalendarClock className="size-4" />
          Data limite: {dueDateLabel(block.month)}
        </span>
      </div>

      {/* KPIs do mês */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          label="Horas totais"
          value={formatWorkedMinutes(block.totalMinutes)}
          icon={<Clock className="size-4" />}
        />
        <Kpi
          label="Valor estimado"
          value={brlFmt.format(block.totalValueCents / 100)}
          icon={<Wallet className="text-primary size-4" />}
          valueClassName="text-primary"
        />
      </div>

      {/* Detalhamento por usuário — cards no mobile, tabela no md+ */}
      <div className="flex flex-col gap-2 md:hidden">
        {block.users.map((u) => (
          <div
            key={u.userId}
            className="bg-card border-border flex items-center justify-between gap-2 rounded-lg border p-3 shadow-sm"
          >
            <span className="min-w-0 truncate font-medium">{u.name}</span>
            <span className="flex shrink-0 flex-col items-end text-sm">
              <span>{formatWorkedMinutes(u.minutes)}</span>
              <span className="text-primary">{formatCents(u.valueCents)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <div className="border-border rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Valor estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.users.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-right">
                    {formatWorkedMinutes(u.minutes)}
                  </TableCell>
                  <TableCell className="text-primary text-right">
                    {formatCents(u.valueCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

type KpiProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
};

/** Card de indicador — mesmo visual dos KPIs do ponto (design-system §6). */
function Kpi({ label, value, icon, valueClassName }: KpiProps) {
  return (
    <div className="bg-card border-border flex flex-col gap-1 rounded-lg border p-4 shadow-sm">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight", valueClassName)}>
        {value}
      </p>
    </div>
  );
}