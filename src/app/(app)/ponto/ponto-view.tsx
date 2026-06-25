"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchOwnEntries } from "@/lib/ponto/actions";
import type { PontoEntry } from "@/lib/ponto/data";
import { getMonthRange, getWeekRange } from "@/lib/ponto/dates";
import { DateRangeField } from "@/components/ui/date-range-field";
import { cn } from "@/lib/utils";
import { NovoPontoDialog } from "./novo-ponto-dialog";
import { PontoKpis } from "./ponto-kpis";
import { PontoList, type DateGroup } from "./ponto-list";

type Preset = "week" | "month" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "custom", label: "Intervalo" },
];

/** Agrupa registros (ordenados por data desc) por dia e, no dia, por título. */
function buildGroups(entries: PontoEntry[]): DateGroup[] {
  const byDate: DateGroup[] = [];
  for (const e of entries) {
    let dateGroup = byDate[byDate.length - 1];
    if (!dateGroup || dateGroup.workDate !== e.workDate) {
      dateGroup = { workDate: e.workDate, titleGroups: [] };
      byDate.push(dateGroup);
    }
    let tg = dateGroup.titleGroups.find((t) => t.title === e.title);
    if (!tg) {
      tg = { title: e.title, totalMinutes: 0, entries: [] };
      dateGroup.titleGroups.push(tg);
    }
    tg.entries.push({
      id: e.id,
      title: e.title,
      workDate: e.workDate,
      workedMinutes: e.workedMinutes,
      description: e.description,
      link: e.link,
    });
    tg.totalMinutes += e.workedMinutes;
  }
  return byDate;
}

type Props = {
  userId: string;
  today: string;
  hourlyRateCents: number | null;
  canRegister: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
};

/**
 * Tela de ponto (SPA): filtro de período (semana / mês / intervalo) via React
 * Query — a lista **e** os KPIs acompanham o filtro. Ver `CLAUDE.md` §6.
 */
export function PontoView({
  userId,
  today,
  hourlyRateCents,
  canRegister,
  canEdit,
  canDelete,
  canReplicate,
}: Props) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(() => getMonthRange(today).from);
  const [customTo, setCustomTo] = useState(today);

  // Intervalo efetivo (no custom, garante from <= to).
  const range = useMemo(() => {
    if (preset === "week") return getWeekRange(today);
    if (preset === "month") return getMonthRange(today);
    return customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : { from: customTo, to: customFrom };
  }, [preset, customFrom, customTo, today]);

  const { data: entries = [], isPending } = useQuery({
    queryKey: ["ponto", userId, range.from, range.to],
    queryFn: () => fetchOwnEntries(range),
    placeholderData: keepPreviousData,
  });

  const totalMinutes = entries.reduce((sum, e) => sum + e.workedMinutes, 0);
  const groups = buildGroups(entries);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Meus registros
        </h1>
        {canRegister ? <NovoPontoDialog today={today} /> : null}
      </div>

      {/* Filtro de período */}
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
      </div>

      {isPending ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Carregando...
        </p>
      ) : (
        <>
          <PontoKpis
            totalMinutes={totalMinutes}
            hourlyRateCents={hourlyRateCents}
          />

          {entries.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
              Nenhum registro no período.
            </div>
          ) : (
            <PontoList
              groups={groups}
              today={today}
              canEdit={canEdit}
              canDelete={canDelete}
              canReplicate={canReplicate}
            />
          )}
        </>
      )}
    </div>
  );
}
