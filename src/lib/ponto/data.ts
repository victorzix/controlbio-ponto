import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
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

/** Entrada de ponto com dados do dono — para a visão de equipe (admin). */
export type TeamEntry = PontoEntry & {
  userId: string;
  userName: string;
  hourlyRateCents: number | null;
};

/**
 * Lista os registros de **vários** usuários no intervalo (inclusivo), com nome e
 * valor/hora do dono. Ordena por **usuário** (nome) e, dentro, por **data desc**
 * — para a visão de equipe somente leitura do admin (spec 007). Uso restrito a
 * quem tem `ponto:ver_equipe` (garantido na action). `[]` se sem usuários.
 */
export async function listEntriesByUsers(
  userIds: string[],
  range: DateRange,
): Promise<TeamEntry[]> {
  if (userIds.length === 0) return [];

  return db
    .select({
      id: registrosPonto.id,
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      link: registrosPonto.link,
      createdAt: registrosPonto.createdAt,
      userId: registrosPonto.userId,
      userName: users.name,
      hourlyRateCents: users.hourlyRateCents,
    })
    .from(registrosPonto)
    .innerJoin(users, eq(registrosPonto.userId, users.id))
    .where(
      and(
        inArray(registrosPonto.userId, userIds),
        gte(registrosPonto.workDate, range.from),
        lte(registrosPonto.workDate, range.to),
      ),
    )
    .orderBy(
      asc(users.name),
      desc(registrosPonto.workDate),
      desc(registrosPonto.createdAt),
    );
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
