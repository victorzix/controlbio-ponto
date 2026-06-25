"use client";

import { Markdown } from "@/components/ui/markdown";
import { Badge } from "@/components/ui/badge";
import { formatWorkedMinutes } from "@/lib/ponto/validation";
import { PontoEntryActions } from "./ponto-entry-actions";
import type { PontoEntryFormData } from "./ponto-form";

type Props = {
  entry: PontoEntryFormData;
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
  /** Mostra o título no topo (oculto quando o card está dentro de um grupo). */
  showTitle?: boolean;
  /** Estilo mais leve + layout compacto, para uso dentro de um grupo. */
  nested?: boolean;
};

/** Card de um registro de ponto: título (opcional) + tempo + descrição + ações. */
export function PontoEntryCard({
  entry,
  today,
  canEdit,
  canDelete,
  canReplicate,
  showTitle = true,
  nested = false,
}: Props) {
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      <Badge variant="secondary">
        {formatWorkedMinutes(entry.workedMinutes)}
      </Badge>
      <PontoEntryActions
        entry={entry}
        today={today}
        canEdit={canEdit}
        canDelete={canDelete}
        canReplicate={canReplicate}
      />
    </div>
  );

  // Dentro de um grupo (sem título): descrição à esquerda, tempo+ações à direita
  // na mesma linha — compacto, sem espaço vazio.
  if (nested) {
    return (
      <div className="bg-background border-border/60 flex items-start justify-between gap-3 rounded-md border p-3">
        <div className="text-foreground/90 min-w-0 flex-1">
          <Markdown source={entry.description} />
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div className="bg-card border-border rounded-lg border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {showTitle ? (
          <p className="min-w-0 truncate font-medium">{entry.title}</p>
        ) : (
          <span className="min-w-0" />
        )}
        {actions}
      </div>
      <div className="text-foreground/90 mt-2">
        <Markdown source={entry.description} />
      </div>
    </div>
  );
}
