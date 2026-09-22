import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { timeTrackings, timeTrackingSegments } from "@/db/schema";
import { todayBrasiliaISO } from "@/lib/tz";
import type { Project } from "@/lib/ponto/validation";
import { computeElapsedAndStatus, type TrackingStatus } from "./compute";

export type { TrackingStatus };

/** Segmento serializável para o client (datas como ISO). */
export type SegmentDTO = {
  id: string;
  /** ISO 8601 (UTC). */
  startedAt: string;
  /** ISO 8601 (UTC) ou null se ainda aberto (rodando). */
  endedAt: string | null;
};

export type ActiveTracking = {
  id: string;
  title: string;
  project: Project;
  status: TrackingStatus;
  /** Ordenados por início (asc). */
  segments: SegmentDTO[];
  /** Tempo total decorrido, em ms: Σ (endedAt ?? serverNow) − startedAt. */
  elapsedMs: number;
  /** Instante do servidor (ISO) — âncora do relógio ao vivo no client. */
  serverNow: string;
  /** Hoje em Brasília (YYYY-MM-DD) — teto de data no modal de finalização. */
  todayBrasilia: string;
};

type SegmentRow = { id: string; startedAt: Date; endedAt: Date | null };

/**
 * Lê o tracking ativo do usuário (com segmentos) e deriva tempo/estado no
 * servidor. `null` se não houver. Sempre escopado por dono (RN-13).
 */
export async function getActiveTracking(
  userId: string,
): Promise<ActiveTracking | null> {
  const trackings = await db
    .select({
      id: timeTrackings.id,
      title: timeTrackings.title,
      project: timeTrackings.project,
    })
    .from(timeTrackings)
    .where(eq(timeTrackings.userId, userId))
    .limit(1);

  const tracking = trackings[0];
  if (!tracking) return null;

  const rows: SegmentRow[] = await db
    .select({
      id: timeTrackingSegments.id,
      startedAt: timeTrackingSegments.startedAt,
      endedAt: timeTrackingSegments.endedAt,
    })
    .from(timeTrackingSegments)
    .where(eq(timeTrackingSegments.trackingId, tracking.id))
    .orderBy(asc(timeTrackingSegments.startedAt));

  const now = new Date();
  const { elapsedMs, status } = computeElapsedAndStatus(rows, now);

  return {
    id: tracking.id,
    title: tracking.title,
    project: tracking.project,
    status,
    segments: rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    })),
    elapsedMs,
    serverNow: now.toISOString(),
    todayBrasilia: todayBrasiliaISO(),
  };
}

/** O segmento aberto (rodando) do tracking, se houver. */
export async function getOpenSegment(
  trackingId: string,
): Promise<SegmentRow | null> {
  const rows = await db
    .select({
      id: timeTrackingSegments.id,
      startedAt: timeTrackingSegments.startedAt,
      endedAt: timeTrackingSegments.endedAt,
    })
    .from(timeTrackingSegments)
    .where(
      and(
        eq(timeTrackingSegments.trackingId, trackingId),
        isNull(timeTrackingSegments.endedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
