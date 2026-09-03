"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { retryEntrySync } from "@/lib/clickup/actions";
import type { ClickUpJobStage, ClickUpSyncStatus } from "@/lib/ponto/data";
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
  /**
   * Motivo da última falha (`clickup_sync_jobs.last_error`), CA-11. Sem ele o
   * card só dizia "falhou" e a pessoa não tinha como saber se o problema era
   * dela (conta sem vínculo) ou do sistema (projeto sem configuração).
   */
  lastError: string | null;
  /**
   * Etapa do job mais recente (`resolve → comment → time_entry → finish →
   * done`) — só é lida enquanto `status === "pending"`, pra dar um rótulo
   * mais específico que "sincronizando" genérico. `null` num registro sem job
   * (raro: nasceu antes da spec 011) cai no mesmo rótulo de `resolve`.
   */
  jobStage: ClickUpJobStage | null;
  /** RF-09: diferencia, no estágio `finish`, "finalizando" de "para revisão". */
  moveToReview: boolean;
};

/**
 * Rótulo curto por etapa, para o estado `pending` — spec 011, sem polling
 * (decisão explícita): o texto reflete a etapa no momento em que a página
 * carregou/recarregou, não acompanha o job ao vivo. Como o job inteiro
 * costuma levar poucos segundos, é normal a pessoa só ver "sincronizado" na
 * próxima vez que abrir a tela — daí o botão de atualizar ao lado do badge.
 */
function stageLabel(
  stage: ClickUpJobStage | null,
  moveToReview: boolean,
): { curto: string; completo: string } {
  switch (stage) {
    case "comment":
      return {
        curto: "enviado",
        completo: "Tarefa criada no ClickUp, registrando o comentário...",
      };
    case "time_entry":
      return {
        curto: "em progresso",
        completo: "Em progresso no ClickUp — lançando o tempo...",
      };
    case "finish":
      return moveToReview
        ? { curto: "para revisão", completo: "Movendo a tarefa para revisão no ClickUp..." }
        : { curto: "finalizando", completo: "Finalizando a sincronização com o ClickUp..." };
    case "done":
      // Só ocorre na fresta entre `advanceStage` gravar "done" e a mesma
      // transação de `completeJob` virar o registro `synced` — não dá pra
      // observar de fora, mas o rótulo mais honesto ainda é "sincronizado".
      return { curto: "sincronizado", completo: "Sincronizado com o ClickUp." };
    case "resolve":
    default:
      return { curto: "enviando", completo: "Enviando para o ClickUp..." };
  }
}

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
export function ClickUpSyncBadge({
  entryId,
  status,
  taskUrl,
  sprintSource,
  lastError,
  jobStage,
  moveToReview,
}: Props) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (status === "off") return null;

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await retryEntrySync(entryId);
      if (res.ok) {
        toast.success("Reenviado para o ClickUp.");
        // `retryJob` já devolveu o registro para `pending` no banco: sem o
        // refresh o card continuaria dizendo "falhou" (e oferecendo reenviar)
        // até um recarregamento manual. Mesmo padrão de `conta-modal.tsx`.
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      notifyUnexpectedError(err);
    } finally {
      setRetrying(false);
    }
  }

  /**
   * Botão de "atualizar" do estado `pending` — decisão explícita de NÃO fazer
   * polling (spec 011): o badge só reflete a etapa de quando a página
   * carregou. `router.refresh()` busca o Server Component de novo sem recarregar
   * a página inteira nem perder scroll/estado local. `router.refresh()` não
   * devolve uma promise que resolve só ao terminar — o spin curto é só
   * feedback visual de "pedido enviado", não confirmação de conclusão.
   */
  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
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
          <span className="inline-flex items-center gap-1">
            <span
              className={cn(badgeVariants({ variant: "outline" }), "text-muted-foreground gap-1")}
              title={stageLabel(jobStage, moveToReview).completo}
              aria-label={stageLabel(jobStage, moveToReview).completo}
            >
              <Clock className="size-3.5" />
              <span className="hidden sm:inline">
                {stageLabel(jobStage, moveToReview).curto}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("text-muted-foreground hover:text-foreground size-6", TOQUE_ALVO)}
              aria-label="Atualizar estado da sincronização"
              title="Atualizar"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </Button>
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
            <span
              className={cn(badgeVariants({ variant: "destructive" }), "gap-1")}
              // O motivo é a diferença entre "não chegou lá" e saber o que
              // fazer a respeito (CA-11). `lastError` vem de
              // `ClickUpError.message` — sem segredo, sem descrição do ponto.
              // `title` não aparece no toque: o mesmo texto vai em `aria-label`
              // (leitor de tela) e, visível, na lista de falhas de `/integracao`.
              title={
                lastError
                  ? `Falha ao sincronizar: ${lastError}`
                  : "Falha ao sincronizar com o ClickUp"
              }
              aria-label={
                lastError
                  ? `Falha ao sincronizar: ${lastError}`
                  : "Falha ao sincronizar com o ClickUp"
              }
            >
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
