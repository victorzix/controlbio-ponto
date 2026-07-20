"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveTracking,
  useTrackingClock,
  useTrackingControls,
} from "@/lib/tracking/use-tracking";
import { formatClock } from "@/lib/tracking/format";
import { useTrackingUiStore } from "@/lib/stores/tracking-ui";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Button } from "@/components/ui/button";

/**
 * Card flutuante fixo no rodapé (spec 010, RF-13): aparece em qualquer tela do
 * app **exceto** `/ponto` (lá o cronômetro é inline) e só quando há tracking
 * ativo. Mostra título · tempo + pausar/retomar + encerrar (abre o modal).
 */
export function TrackingFloater() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const query = useActiveTracking();
  const { pause, resume, stop } = useTrackingControls();
  const openFinalize = useTrackingUiStore((s) => s.openFinalize);
  const tracking = query.data;
  const { totalMs } = useTrackingClock(tracking, query.dataUpdatedAt);

  const onPonto = pathname === "/ponto" || pathname.startsWith("/ponto/");
  const visible = !!tracking && !onPonto;
  const running = tracking?.status === "running";

  async function safe(fn: () => Promise<{ error?: string }>) {
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      return res;
    } catch (err) {
      notifyUnexpectedError(err);
      return { error: "erro" };
    }
  }

  return (
    <AnimatePresence>
      {visible && tracking ? (
        <motion.div
          className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <div className="bg-card mx-auto flex max-w-5xl items-center gap-3 rounded-xl border p-3 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{tracking.title}</p>
              <p className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatClock(totalMs)}
                {!running ? " · pausado" : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label={running ? "Pausar" : "Retomar"}
              onClick={() => safe(running ? pause : resume)}
            >
              {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Encerrar"
              onClick={async () => {
                const res = await safe(stop);
                if (!res.error) openFinalize();
              }}
            >
              <Square className="size-4" />
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
