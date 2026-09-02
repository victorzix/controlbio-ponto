"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { retryEntrySync } from "@/lib/clickup/actions";
import type { ClickUpSyncStatus } from "@/lib/ponto/data";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  entryId: string;
  status: ClickUpSyncStatus;
  taskUrl: string | null;
  /** `SprintPick["source"]` gravado pelo pipeline — 'backlog' vira o aviso "sem sprint". */
  sprintSource: string | null;
};

/**
 * Truque de alvo de toque (`CLAUDE.md` §4): o pseudo-elemento `before` estica a
 * área clicável além da caixa visível (sem alterar layout/altura da linha),
 * pra chegar aos ≥44px exigidos mesmo com o badge visualmente compacto — a
 * densidade do card não pode aumentar por causa disto.
 */
const TOQUE_ALVO = "relative before:absolute before:-inset-3 before:content-['']";

/**
 * Badge de estado de sincronização com o ClickUp no card do ponto — spec 011,
 * design §6.4 (Tarefa 16). É o único lugar em que a pessoa aprende se o ponto
 * chegou lá; sem isto, uma falha de sincronização fica invisível.
 *
 * `off` não renderiza nada (registro nascido com a integração desligada).
 */
export function ClickUpSyncBadge({ entryId, status, taskUrl, sprintSource }: Props) {
  const reduceMotion = useReducedMotion();
  const [retrying, setRetrying] = useState(false);

  if (status === "off") return null;

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await retryEntrySync(entryId);
      if (res.ok) {
        toast.success("Reenviado para o ClickUp.");
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      notifyUnexpectedError(err);
    } finally {
      setRetrying(false);
    }
  }

  // Chave da animação: cada estado visual distinto troca com fade+slide (§7 do
  // design system); 'sem sprint' é um estado visual próprio, não só 'synced'.
  const key =
    status === "synced" && sprintSource === "backlog" ? "synced-backlog" : status;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={key}
        className="inline-flex shrink-0"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {status === "pending" ? (
          <span
            className={cn(badgeVariants({ variant: "outline" }), "text-muted-foreground gap-1")}
            title="Aguardando sincronização com o ClickUp"
          >
            <Clock className="size-3.5" />
            <span className="hidden sm:inline">sincronizando</span>
          </span>
        ) : status === "synced" ? (
          sprintSource === "backlog" ? (
            <a
              href={taskUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sincronizado no ClickUp, sem sprint — abrir tarefa"
              title="Sincronizado, mas caiu no backlog (sem sprint para o dia)"
              className={cn(
                badgeVariants({ variant: "warning" }),
                "gap-1",
                TOQUE_ALVO,
                !taskUrl && "pointer-events-none opacity-70",
              )}
            >
              <AlertTriangle className="size-3.5" />
              <span className="hidden sm:inline">sem sprint</span>
            </a>
          ) : (
            <a
              href={taskUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sincronizado no ClickUp — abrir tarefa"
              title="Sincronizado com o ClickUp"
              className={cn(
                badgeVariants({ variant: "secondary" }),
                "gap-1",
                TOQUE_ALVO,
                !taskUrl && "pointer-events-none opacity-70",
              )}
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">sincronizado</span>
            </a>
          )
        ) : (
          // failed
          <span className="inline-flex items-center gap-1">
            <span className={cn(badgeVariants({ variant: "destructive" }), "gap-1")}>
              <AlertTriangle className="size-3.5" />
              <span className="hidden sm:inline">falhou</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("text-muted-foreground hover:text-foreground size-6", TOQUE_ALVO)}
              aria-label="Reenviar para o ClickUp"
              title="Reenviar"
              onClick={handleRetry}
              disabled={retrying}
            >
              <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} />
            </Button>
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}
