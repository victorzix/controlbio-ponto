"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { createEntrySchema, updateEntrySchema } from "./validation";
import {
  listOwnEntries,
  listEntriesByUsers,
  type DateRange,
  type PontoEntry,
  type TeamEntry,
} from "./data";

/**
 * Leitura dos registros do próprio usuário (opcionalmente por intervalo) para o
 * client (React Query). Guarda no servidor: exige `ponto:ver_proprio`.
 */
export async function fetchOwnEntries(
  range?: DateRange,
): Promise<PontoEntry[]> {
  const user = await requirePermission("ponto:ver_proprio");
  return listOwnEntries(user.id, range);
}

/**
 * Leitura dos registros de **vários** usuários (visão de equipe do admin, spec
 * 007). Guarda no servidor: exige `ponto:ver_equipe`. Somente leitura — não há
 * action para criar/editar/excluir ponto de outro usuário.
 */
export async function fetchEntriesByUsers(
  userIds: string[],
  range: DateRange,
): Promise<TeamEntry[]> {
  await requirePermission("ponto:ver_equipe");

  const ids = (Array.isArray(userIds) ? userIds : []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  return listEntriesByUsers(ids, range);
}

export type PontoActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Quantos registros foram criados (split em vários dias). */
  created?: number;
};

const DAY_MINUTES = 1440;

/** Soma `days` dias a uma data "YYYY-MM-DD" (em horário local) e devolve ISO. */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Extrai erros por campo de um ZodError (primeiro erro de cada campo). */
function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * Cria registro(s) de ponto para o usuário autenticado.
 * RN-05: o dono é SEMPRE o usuário da sessão (nunca um id vindo do cliente).
 *
 * Se o tempo passar de 24h, **distribui** em vários dias (máx. 24h/dia) a partir
 * do dia escolhido — um registro por dia, todos com o mesmo título/descrição/link
 * (os dias gerados podem cair no futuro). Revalida no servidor — nunca confiar no client.
 */
export async function createEntry(input: unknown): Promise<PontoActionState> {
  const user = await requirePermission("ponto:registrar");

  const parsed = createEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { title, workDate, hours, minutes, description, link } = parsed.data;
  const linkValue = link && link.length > 0 ? link : null;
  const totalMinutes = hours * 60 + minutes;

  // Fatia em dias de no máximo 24h, a partir de `workDate`.
  const rows: (typeof registrosPonto.$inferInsert)[] = [];
  let remaining = totalMinutes;
  let dayOffset = 0;
  while (remaining > 0) {
    const dayMinutes = Math.min(remaining, DAY_MINUTES);
    rows.push({
      userId: user.id,
      title,
      workDate: addDaysISO(workDate, dayOffset),
      workedMinutes: dayMinutes,
      description,
      link: linkValue,
    });
    remaining -= dayMinutes;
    dayOffset += 1;
  }

  await db.insert(registrosPonto).values(rows);

  return { ok: true, created: rows.length };
}

/**
 * Edita um registro de ponto do próprio usuário.
 * Segurança: a atualização só atinge a linha cujo `user_id` é o da sessão
 * (RN-05) — ninguém edita registro de outro, mesmo passando um id qualquer.
 */
export async function updateEntry(
  id: string,
  input: unknown,
): Promise<PontoActionState> {
  const user = await requirePermission("ponto:editar");

  if (typeof id !== "string" || !id) {
    return { error: "Registro inválido." };
  }

  const parsed = updateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: collectFieldErrors(parsed.error.issues) };
  }

  const { title, workDate, hours, minutes, description, link } = parsed.data;

  const updated = await db
    .update(registrosPonto)
    .set({
      title,
      workDate,
      workedMinutes: hours * 60 + minutes,
      description,
      link: link && link.length > 0 ? link : null,
    })
    .where(and(eq(registrosPonto.id, id), eq(registrosPonto.userId, user.id)))
    .returning({ id: registrosPonto.id });

  if (updated.length === 0) {
    return { error: "Registro não encontrado." };
  }

  return { ok: true };
}

/**
 * Exclui um registro de ponto do próprio usuário.
 * Segurança: a exclusão é escopada por dono (RN-05).
 */
export async function deleteEntry(id: string): Promise<void> {
  const user = await requirePermission("ponto:excluir");
  if (!id) return;

  await db
    .delete(registrosPonto)
    .where(and(eq(registrosPonto.id, id), eq(registrosPonto.userId, user.id)));
}
