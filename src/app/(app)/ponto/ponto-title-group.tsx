"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatWorkedMinutes } from "@/lib/ponto/validation";
import { cn } from "@/lib/utils";
import { PontoEntryCard } from "./ponto-entry-card";
import type { PontoEntryFormData } from "./ponto-form";

type Props = {
  title: string;
  totalMinutes: number;
  entries: PontoEntryFormData[];
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
};

/**
 * Agrupa vários registros de **mesmo título no mesmo dia**: cabeçalho com título
 * e **horas totais**, colapsável — ao abrir, mostra cada registro (com suas
 * horas, descrição e ações).
 */
export function PontoTitleGroup({
  title,
  totalMinutes,
  entries,
  today,
  canEdit,
  canDelete,
  canReplicate,
}: Props) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-accent/50 flex w-full items-center justify-between gap-2 p-4 text-left transition-colors"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="truncate font-medium">{title}</span>
          <span className="text-muted-foreground shrink-0 text-xs">
            ({entries.length})
          </span>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {formatWorkedMinutes(totalMinutes)}
        </Badge>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }
            }
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-border flex flex-col gap-2 border-t p-3">
              {entries.map((e) => (
                <PontoEntryCard
                  key={e.id}
                  entry={e}
                  today={today}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canReplicate={canReplicate}
                  showTitle={false}
                  nested
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
