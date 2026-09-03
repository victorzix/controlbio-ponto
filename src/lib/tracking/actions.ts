"use server";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  registrosPonto,
  timeTrackings,
  timeTrackingSegments,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { initialSyncStatus, isSyncEnabled } from "@/lib/clickup/enabled";
import { enqueuePushEntry } from "@/lib/clickup/queue";
import {
  getActiveTracking,
  getOpenSegment,
  type ActiveTracking,
} from "./data";
import {
  finalizeTrackingSchema,
  startTrackingSchema,
} from "./validation";

export type TrackingActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Quantos pontos foram criados na finalização. */
  created?: number;
};

/** Erros por campo (caminho com pontos, ex.: "segments.0.hours") de um ZodError. */
function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Retorna o id do tracking do usuário (escopado por dono) ou null. */
async function getOwnTrackingId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: timeTrackings.id })
    .from(timeTrackings)
    .where(eq(timeTrackings.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Leitura do tracking ativo (para o client / React Query). */
export async function fetchActiveTracking(): Promise<ActiveTracking | null> {
  const user = await requirePermission("ponto:ver_proprio");
  return getActiveTracking(user.id);
}

/**
 * Inicia um tracking com título + projeto (RN-02). Cria o rascunho e o 1º
 * segmento (aberto, começando agora). Bloqueia se já houver um ativo (RN-01).
 */
export async function startTracking(
  input: unknown,
): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");

  const parsed = startTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const existing = await getOwnTrackingId(user.id);
  if (existing) {
    return { error: "Você já tem um cronômetro ativo." };
  }

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      const [tracking] = await tx
        .insert(timeTrackings)
        .values({
          userId: user.id,
          title: parsed.data.title,
          project: parsed.data.project,
        })
        .returning({ id: timeTrackings.id });

      await tx.insert(timeTrackingSegments).values({
        trackingId: tracking.id,
        startedAt: now,
      });
    });
  } catch {
    // A UNIQUE(user_id) protege contra corrida entre abas.
    return { error: "Você já tem um cronômetro ativo." };
  }

  return { ok: true };
}

/**
 * Pausa: fecha o segmento aberto (ended_at = agora). Não abre modal nem cria
 * ponto (RN-06). No-op se já estiver pausado. Escopado por dono.
 */
export async function pauseTracking(): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  const trackingId = await getOwnTrackingId(user.id);
  if (!trackingId) return { error: "Nenhum cronômetro ativo." };

  await db
    .update(timeTrackingSegments)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(timeTrackingSegments.trackingId, trackingId),
        isNull(timeTrackingSegments.endedAt),
      ),
    );

  return { ok: true };
}

/**
 * Retoma: abre um novo segmento (começando agora) — o "duplicar" (RN-06).
 * No-op se já estiver rodando.
 */
export async function resumeTracking(): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  const trackingId = await getOwnTrackingId(user.id);
  if (!trackingId) return { error: "Nenhum cronômetro ativo." };

  const open = await getOpenSegment(trackingId);
  if (open) return { ok: true }; // já rodando

  await db.insert(timeTrackingSegments).values({
    trackingId,
    startedAt: new Date(),
  });

  return { ok: true };
}

/**
 * Ajusta a hora de início do **segmento em curso** (RN-07). O novo início não
 * pode ser no futuro nem antes do fim do segmento anterior (sem sobreposição,
 * RN-16). Exige um segmento aberto (tracking rodando).
 */
export async function adjustCurrentStart(
  startedAtISO: unknown,
): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  const trackingId = await getOwnTrackingId(user.id);
  if (!trackingId) return { error: "Nenhum cronômetro ativo." };

  if (typeof startedAtISO !== "string") {
    return { error: "Data inválida." };
  }
  const newStart = new Date(startedAtISO);
  if (Number.isNaN(newStart.getTime())) {
    return { error: "Data inválida." };
  }

  const open = await getOpenSegment(trackingId);
  if (!open) {
    return { error: "O cronômetro precisa estar rodando para ajustar o início." };
  }

  const now = new Date();
  if (newStart.getTime() > now.getTime()) {
    return { error: "O início não pode ser no futuro." };
  }

  // Fim do último segmento já encerrado (limite inferior — sem sobreposição).
  const [prev] = await db
    .select({ endedAt: timeTrackingSegments.endedAt })
    .from(timeTrackingSegments)
    .where(
      and(
        eq(timeTrackingSegments.trackingId, trackingId),
        isNotNull(timeTrackingSegments.endedAt),
      ),
    )
    .orderBy(desc(timeTrackingSegments.endedAt))
    .limit(1);

  if (prev?.endedAt && newStart.getTime() < prev.endedAt.getTime()) {
    return { error: "O início não pode ser antes do bloco anterior." };
  }

  await db
    .update(timeTrackingSegments)
    .set({ startedAt: newStart })
    .where(eq(timeTrackingSegments.id, open.id));

  return { ok: true };
}

/**
 * Encerra: fecha o segmento aberto (se houver). NÃO apaga o rascunho — o client
 * abre o modal de finalização (RN-08). Idempotente.
 */
export async function stopTracking(): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  const trackingId = await getOwnTrackingId(user.id);
  if (!trackingId) return { error: "Nenhum cronômetro ativo." };

  await db
    .update(timeTrackingSegments)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(timeTrackingSegments.trackingId, trackingId),
        isNull(timeTrackingSegments.endedAt),
      ),
    );

  return { ok: true };
}

/**
 * Finaliza: cada segmento vira um `registros_ponto` independente (mesmo
 * título/projeto), com dia/tempo/descrição do modal. Atômico; ao final apaga o
 * rascunho (cascade nos segmentos). RN-10.
 */
export async function finalizeTracking(
  input: unknown,
): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  const trackingId = await getOwnTrackingId(user.id);
  if (!trackingId) return { error: "Nenhum cronômetro ativo." };

  const parsed = finalizeTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { title, project, segments, moveToReview } = parsed.data;
  const rows = segments.map((s) => ({
    userId: user.id,
    title,
    workDate: s.workDate,
    workedMinutes: s.hours * 60 + s.minutes,
    description: s.description,
    link: null,
    project,
    clickupSyncStatus: initialSyncStatus(),
  }));

  const syncOn = isSyncEnabled();

  await db.transaction(async (tx) => {
    // Cada segmento vira um ponto e um job — na mesma transação (mesmo motivo
    // do `createEntry`: job e ponto nascem juntos, ou nenhum dos dois nasce).
    const created = await tx
      .insert(registrosPonto)
      .values(rows)
      .returning({ id: registrosPonto.id });

    if (syncOn) {
      for (let i = 0; i < created.length; i++) {
        await enqueuePushEntry(tx, {
          entryId: created[i].id,
          // Só o último segmento fecha a tarefa — a pessoa termina uma vez,
          // não uma vez por segmento (RF-09/RN-04).
          moveToReview: moveToReview && i === created.length - 1,
        });
      }
    }

    // Escopado por dono: só apaga o próprio rascunho.
    await tx
      .delete(timeTrackings)
      .where(
        and(eq(timeTrackings.id, trackingId), eq(timeTrackings.userId, user.id)),
      );
  });

  return { ok: true, created: rows.length };
}

/** Descarta o rascunho inteiro sem gerar ponto (ação destrutiva). */
export async function discardTracking(): Promise<TrackingActionState> {
  const user = await requirePermission("ponto:registrar");
  await db.delete(timeTrackings).where(eq(timeTrackings.userId, user.id));
  return { ok: true };
}
