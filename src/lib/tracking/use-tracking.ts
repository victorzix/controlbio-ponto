"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustCurrentStart,
  discardTracking,
  fetchActiveTracking,
  finalizeTracking,
  pauseTracking,
  resumeTracking,
  startTracking,
  stopTracking,
  type TrackingActionState,
} from "./actions";
import type { ActiveTracking } from "./data";

export const TRACKING_QUERY_KEY = ["tracking"] as const;

/**
 * Lê o tracking ativo (server state via React Query). Reidrata ao focar a
 * janela (RN-04) — sobrepõe o default do provider — e não usa cache velho, já
 * que o tempo depende do instante da leitura.
 */
export function useActiveTracking() {
  return useQuery({
    queryKey: TRACKING_QUERY_KEY,
    queryFn: () => fetchActiveTracking(),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * Relógio ao vivo do tracking, ancorado no instante em que o dado chegou
 * (`dataUpdatedAt`) — evita drift/fuso: enquanto **rodando**, soma o tempo
 * passado desde a leitura; enquanto **pausado**, é fixo. "Tick" a cada segundo
 * só quando rodando. Retorna:
 * - `totalMs`: soma de todos os segmentos (RN-03);
 * - `currentBlockMs`: só o segmento atual (aberto se rodando; último se pausado).
 */
export function useTrackingClock(
  tracking: ActiveTracking | null | undefined,
  dataUpdatedAt: number,
): { totalMs: number; currentBlockMs: number } {
  const running = tracking?.status === "running";
  // `now` é state (atualizado no efeito) para não chamar Date.now() no render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    // Atualizado pelo interval (subscription); valor inicial do lazy useState.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!tracking) return { totalMs: 0, currentBlockMs: 0 };

  const extra = running ? Math.max(0, now - dataUpdatedAt) : 0;
  const totalMs = tracking.elapsedMs + extra;

  // Base (no instante da leitura) do bloco atual: segmento aberto ou o último.
  const serverNow = new Date(tracking.serverNow).getTime();
  const open = tracking.segments.find((s) => s.endedAt == null);
  let base = 0;
  if (open) {
    base = Math.max(0, serverNow - new Date(open.startedAt).getTime());
  } else {
    const last = tracking.segments[tracking.segments.length - 1];
    if (last?.endedAt) {
      base = Math.max(
        0,
        new Date(last.endedAt).getTime() - new Date(last.startedAt).getTime(),
      );
    }
  }
  return { totalMs, currentBlockMs: base + extra };
}

/**
 * Ações do tracking já com invalidação da query. Cada uma retorna o
 * `TrackingActionState` para o chamador tratar erros por campo/toast. A
 * finalização também invalida a lista de pontos (`["ponto"]`).
 */
export function useTrackingControls() {
  const qc = useQueryClient();

  const invalidateTracking = () =>
    qc.invalidateQueries({ queryKey: TRACKING_QUERY_KEY });

  async function wrap(
    fn: () => Promise<TrackingActionState>,
  ): Promise<TrackingActionState> {
    const res = await fn();
    await invalidateTracking();
    return res;
  }

  return {
    start: (input: { title: string; project: string }) =>
      wrap(() => startTracking(input)),
    pause: () => wrap(() => pauseTracking()),
    resume: () => wrap(() => resumeTracking()),
    adjust: (startedAtISO: string) => wrap(() => adjustCurrentStart(startedAtISO)),
    stop: () => wrap(() => stopTracking()),
    discard: () => wrap(() => discardTracking()),
    finalize: async (input: unknown) => {
      const res = await finalizeTracking(input);
      await invalidateTracking();
      await qc.invalidateQueries({ queryKey: ["ponto"] });
      return res;
    },
  };
}
