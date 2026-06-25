import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto, users } from "@/db/schema";

/** Intervalo de datas (inclusivo), em "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

export type PontoEntry = {
  id: string;
  title: string;
  workDate: string;
  workedMinutes: number;
  description: string;
  link: string | null;
  createdAt: Date;
};

/**
 * Lista os registros de ponto do próprio usuário, mais recentes primeiro.
 * Sempre filtra por dono (RF-05). Se `range` for passado, restringe ao intervalo
 * de datas (inclusivo).
 */
export async function listOwnEntries(
  userId: string,
  range?: DateRange,
): Promise<PontoEntry[]> {
  const where = range
    ? and(
        eq(registrosPonto.userId, userId),
        gte(registrosPonto.workDate, range.from),
        lte(registrosPonto.workDate, range.to),
      )
    : eq(registrosPonto.userId, userId);

  return db
    .select({
      id: registrosPonto.id,
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      link: registrosPonto.link,
      createdAt: registrosPonto.createdAt,
    })
    .from(registrosPonto)
    .where(where)
    .orderBy(desc(registrosPonto.workDate), desc(registrosPonto.createdAt));
}

/** Valor/hora (em centavos) do usuário, para estimar valores no painel. */
export async function getOwnHourlyRateCents(
  userId: string,
): Promise<number | null> {
  const rows = await db
    .select({ cents: users.hourlyRateCents })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.cents ?? null;
}
