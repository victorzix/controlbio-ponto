/** Cálculo puro de tempo/estado do tracking (sem dependência de banco). */

export type TrackingStatus = "running" | "paused";

/**
 * Tempo decorrido (ms) e estado a partir dos segmentos. **Rodando** se há algum
 * segmento aberto (`endedAt == null`); senão, **pausado**. Ignora deltas
 * negativos (defensivo contra relógio inconsistente).
 */
export function computeElapsedAndStatus(
  segments: { startedAt: Date; endedAt: Date | null }[],
  now: Date,
): { elapsedMs: number; status: TrackingStatus } {
  let elapsedMs = 0;
  let running = false;
  for (const s of segments) {
    const end = s.endedAt ?? now;
    const delta = end.getTime() - s.startedAt.getTime();
    if (delta > 0) elapsedMs += delta;
    if (s.endedAt == null) running = true;
  }
  return { elapsedMs, status: running ? "running" : "paused" };
}
