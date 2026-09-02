"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { fetchEntriesByUsers, fetchOwnEntries } from "@/lib/ponto/actions";
import type { PontoEntry, TeamEntry } from "@/lib/ponto/data";
import type { ReportUserOption } from "@/lib/relatorios/data";
import {
  getMonthRange,
  getPreviousMonthRange,
  getWeekRange,
} from "@/lib/ponto/dates";
import {
  formatWorkedMinutes,
  PROJECT_OPTIONS,
  type Project,
} from "@/lib/ponto/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangeField } from "@/components/ui/date-range-field";
import { cn } from "@/lib/utils";
import { UserMultiSelect } from "../user-multiselect";
import { NovoPontoDialog } from "./novo-ponto-dialog";
import { TrackingPanel } from "./tracking-panel";
import { PontoKpis, estimateCents } from "./ponto-kpis";
import { PontoList, type DateGroup } from "./ponto-list";

type Preset = "previousMonth" | "week" | "month" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "previousMonth", label: "Mês anterior" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "custom", label: "Intervalo" },
];

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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
      project: e.project,
      clickupTaskId: e.clickupTaskId,
      clickupTaskUrl: e.clickupTaskUrl,
      clickupSyncStatus: e.clickupSyncStatus,
      clickupSprintSource: e.clickupSprintSource,
      clickupLastError: e.clickupLastError,
    });
    tg.totalMinutes += e.workedMinutes;
  }
  return byDate;
}

type UserSection = {
  userId: string;
  userName: string;
  totalMinutes: number;
  valueCents: number | null;
  groups: DateGroup[];
};

/** Quebra os registros da equipe (ordenados por usuário) em seções por usuário. */
function buildUserSections(entries: TeamEntry[]): UserSection[] {
  const sections: UserSection[] = [];
  let i = 0;
  while (i < entries.length) {
    const userId = entries[i].userId;
    const userName = entries[i].userName;
    const rateCents = entries[i].hourlyRateCents;
    const userEntries: TeamEntry[] = [];
    while (i < entries.length && entries[i].userId === userId) {
      userEntries.push(entries[i]);
      i++;
    }
    const totalMinutes = userEntries.reduce((s, e) => s + e.workedMinutes, 0);
    sections.push({
      userId,
      userName,
      totalMinutes,
      valueCents: estimateCents(totalMinutes, rateCents),
      groups: buildGroups(userEntries),
    });
  }
  return sections;
}

type Props = {
  userId: string;
  today: string;
  hourlyRateCents: number | null;
  canRegister: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
  /** Admin: pode ver registros de outros usuários (spec 007). */
  canVerEquipe: boolean;
  /** Usuários selecionáveis (apenas admin; vazio para funcionário). */
  users: ReportUserOption[];
};

/**
 * Tela de ponto (SPA): filtro de período (semana / mês / intervalo) via React
 * Query — lista e KPIs acompanham o filtro. Para **admin** (spec 007) há ainda
 * um seletor de usuários: o default é só ele (CRUD normal); ao incluir outros, a
 * visão vira **somente leitura** e mostra os registros por usuário. Ver `CLAUDE.md` §6.
 */
export function PontoView({
  userId,
  today,
  hourlyRateCents,
  canRegister,
  canEdit,
  canDelete,
  canReplicate,
  canVerEquipe,
  users,
}: Props) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState(() => getMonthRange(today).from);
  const [customTo, setCustomTo] = useState(today);
  // Default: só o próprio usuário (RF: ao abrir, é o dele).
  const [selectedIds, setSelectedIds] = useState<string[]>([userId]);
  const [projectFilter, setProjectFilter] = useState<"all" | Project>("all");

  const range = useMemo(() => {
    if (preset === "previousMonth") return getPreviousMonthRange(today);
    if (preset === "week") return getWeekRange(today);
    if (preset === "month") return getMonthRange(today);
    return customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : { from: customTo, to: customFrom };
  }, [preset, customFrom, customTo, today]);

  // "Só eu" = comportamento clássico (CRUD). Senão, visão de equipe (read-only).
  const isOwnOnly = selectedIds.length === 1 && selectedIds[0] === userId;
  const useOwn = !canVerEquipe || isOwnOnly;
  const sortedIds = useMemo(() => [...selectedIds].sort(), [selectedIds]);

  // Própria lista (funcionário, ou admin vendo só a si): key ["ponto"] para as
  // mutações de criar/editar/excluir invalidarem corretamente.
  const ownQuery = useQuery({
    queryKey: ["ponto", userId, range.from, range.to],
    queryFn: () => fetchOwnEntries(range),
    enabled: useOwn,
    placeholderData: keepPreviousData,
  });

  // Equipe (admin, com outros selecionados): somente leitura.
  const teamQuery = useQuery({
    queryKey: ["ponto-team", range.from, range.to, sortedIds],
    queryFn: () => fetchEntriesByUsers(selectedIds, range),
    enabled: canVerEquipe && !isOwnOnly && selectedIds.length > 0,
    placeholderData: keepPreviousData,
  });

  // Refaz a query ativa (própria ou de equipe).
  const isFetching = useOwn ? ownQuery.isFetching : teamQuery.isFetching;
  function refresh() {
    if (useOwn) ownQuery.refetch();
    else teamQuery.refetch();
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {useOwn ? "Meus registros" : "Registros da equipe"}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={refresh}
            disabled={isFetching || (!useOwn && selectedIds.length === 0)}
            aria-label="Atualizar"
            title="Atualizar"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
          {canRegister && useOwn ? <NovoPontoDialog today={today} /> : null}
        </div>
      </div>

      {/* Filtros: período (+ usuários, só admin) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Período"
          className="bg-muted inline-flex w-full overflow-x-auto rounded-lg p-1 sm:w-auto"
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
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

        {canVerEquipe ? (
          <UserMultiSelect
            users={users}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />
        ) : null}

        {/* Filtro de projeto */}
        <div
          role="radiogroup"
          aria-label="Projeto"
          className="bg-muted inline-flex w-full overflow-x-auto rounded-lg p-1 sm:w-auto"
        >
          {([{ value: "all", label: "Todos" }, ...PROJECT_OPTIONS] as const).map(
            (p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={projectFilter === p.value}
                onClick={() => setProjectFilter(p.value as "all" | Project)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
                  projectFilter === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ),
          )}
        </div>
      </div>

      {useOwn ? (
        <OwnContent
          query={ownQuery}
          today={today}
          hourlyRateCents={hourlyRateCents}
          canEdit={canEdit}
          canDelete={canDelete}
          canReplicate={canReplicate}
          projectFilter={projectFilter}
        />
      ) : selectedIds.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          Selecione ao menos um usuário.
        </div>
      ) : (
        <TeamContent query={teamQuery} today={today} projectFilter={projectFilter} />
      )}
    </div>
  );
}

/** Visão clássica do próprio ponto (com CRUD). */
function OwnContent({
  query,
  today,
  hourlyRateCents,
  canEdit,
  canDelete,
  canReplicate,
  projectFilter,
}: {
  query: { data?: PontoEntry[]; isPending: boolean };
  today: string;
  hourlyRateCents: number | null;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
  projectFilter: "all" | Project;
}) {
  const all = query.data ?? [];
  const entries =
    projectFilter === "all" ? all : all.filter((e) => e.project === projectFilter);
  const totalMinutes = entries.reduce((s, e) => s + e.workedMinutes, 0);
  const groups = buildGroups(entries);

  return (
    <>
      {/* KPIs logo abaixo dos filtros. */}
      {query.isPending ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Carregando...
        </p>
      ) : (
        <PontoKpis
          totalMinutes={totalMinutes}
          valueCents={estimateCents(totalMinutes, hourlyRateCents)}
          hint={
            hourlyRateCents != null
              ? `${brlFmt.format(hourlyRateCents / 100)}/h`
              : "defina o valor/hora no usuário"
          }
        />
      )}

      {/* Cronômetro (spec 010) — abaixo dos KPIs, acima da lista. */}
      <TrackingPanel />

      {!query.isPending ? (
        entries.length === 0 ? (
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
        )
      ) : null}
    </>
  );
}

/** Visão de equipe (admin): registros por usuário, somente leitura. */
function TeamContent({
  query,
  today,
  projectFilter,
}: {
  query: { data?: TeamEntry[]; isPending: boolean };
  today: string;
  projectFilter: "all" | Project;
}) {
  const filtered =
    projectFilter === "all"
      ? (query.data ?? [])
      : (query.data ?? []).filter((e) => e.project === projectFilter);

  const sections = useMemo(
    () => buildUserSections(filtered),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, projectFilter],
  );

  const totalMinutes = sections.reduce((s, u) => s + u.totalMinutes, 0);
  const anyRate = sections.some((u) => u.valueCents != null);
  const totalValueCents = anyRate
    ? sections.reduce((s, u) => s + (u.valueCents ?? 0), 0)
    : null;

  if (query.isPending) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Carregando...
      </p>
    );
  }

  return (
    <>
      <PontoKpis totalMinutes={totalMinutes} valueCents={totalValueCents} />
      {sections.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          Nenhum registro no período.
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((u) => (
            <section key={u.userId} className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h2 className="min-w-0 truncate text-lg font-semibold">
                  {u.userName}
                </h2>
                <Badge variant="secondary" className="shrink-0">
                  {formatWorkedMinutes(u.totalMinutes)}
                </Badge>
              </div>
              {/* Somente leitura: sem editar/excluir/replicar. */}
              <PontoList
                groups={u.groups}
                today={today}
                canEdit={false}
                canDelete={false}
                canReplicate={false}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}