"use client";

import { formatEntryDateLabel } from "@/lib/ponto/dates";
import { PontoEntryCard } from "./ponto-entry-card";
import { PontoTitleGroup } from "./ponto-title-group";
import type { PontoEntryFormData } from "./ponto-form";

export type TitleGroup = {
  title: string;
  totalMinutes: number;
  entries: PontoEntryFormData[];
};

export type DateGroup = {
  workDate: string;
  titleGroups: TitleGroup[];
};

type Props = {
  groups: DateGroup[];
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
};

/**
 * Lista de registros agrupada por data (cabeçalho com rótulo amigável). Dentro
 * de cada dia, registros de mesmo título viram um grupo colapsável; títulos com
 * um único registro aparecem como card normal.
 */
export function PontoList({
  groups,
  today,
  canEdit,
  canDelete,
  canReplicate,
}: Props) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.workDate} className="space-y-2">
          <h2 className="text-muted-foreground px-1 text-sm font-semibold tracking-tight">
            {formatEntryDateLabel(g.workDate, today)}
          </h2>
          <div className="flex flex-col gap-3">
            {g.titleGroups.map((tg, i) =>
              tg.entries.length === 1 ? (
                <PontoEntryCard
                  key={tg.entries[0].id}
                  entry={tg.entries[0]}
                  today={today}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canReplicate={canReplicate}
                />
              ) : (
                <PontoTitleGroup
                  key={`${g.workDate}-${i}`}
                  title={tg.title}
                  totalMinutes={tg.totalMinutes}
                  entries={tg.entries}
                  today={today}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canReplicate={canReplicate}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
