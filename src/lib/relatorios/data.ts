import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto, users } from "@/db/schema";
import type { DateRange } from "@/lib/ponto/data";

/** Usuário selecionável no relatório (sem dados sensíveis). */
export type ReportUserOption = {
  id: string;
  name: string;
  active: boolean;
};

/** Linha agregada: horas de um usuário num mês. */
export type ReportRow = {
  userId: string;
  name: string;
  hourlyRateCents: number | null;
  /** Mês do registro, "YYYY-MM". */
  month: string;
  /** Total de minutos do usuário naquele mês, dentro do período. */
  totalMinutes: number;
};

/** Lista todos os usuários (ativos e inativos) para o seletor do relatório. */
export async function listReportUsers(): Promise<ReportUserOption[]> {
  return db
    .select({ id: users.id, name: users.name, active: users.active })
    .from(users)
    .orderBy(asc(users.name));
}

/**
 * Agrega horas por **usuário** e **mês** (spec 006). Soma os minutos dos
 * registros dos usuários informados, dentro do intervalo (inclusivo), agrupando
 * pelo mês da data do registro (`to_char(work_date,'YYYY-MM')`). O mês só soma
 * os dias que caem no período (RN-03). Junta `users` para nome e valor/hora.
 */
export async function reportByUserMonth(
  range: DateRange,
  userIds: string[],
): Promise<ReportRow[]> {
  if (userIds.length === 0) return [];

  const month = sql<string>`to_char(${registrosPonto.workDate}, 'YYYY-MM')`;

  const rows = await db
    .select({
      userId: registrosPonto.userId,
      name: users.name,
      hourlyRateCents: users.hourlyRateCents,
      month,
      totalMinutes: sql<number>`sum(${registrosPonto.workedMinutes})::int`,
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
    .groupBy(registrosPonto.userId, users.name, users.hourlyRateCents, month);

  // Coage o SUM (pode vir como string do driver) para número.
  return rows.map((r) => ({ ...r, totalMinutes: Number(r.totalMinutes) }));
}

/** Uma entrada de ponto, com dono e valor/hora — para a exportação detalhada. */
export type ExportEntry = {
  userId: string;
  userName: string;
  hourlyRateCents: number | null;
  workDate: string;
  title: string;
  workedMinutes: number;
  description: string;
};

/**
 * Lista as entradas de ponto (sem agregar) dos usuários informados, dentro do
 * intervalo (inclusivo), ordenadas por **usuário** (nome) e depois por **data**
 * — exatamente a ordem do arquivo exportado (spec 006). `[]` se sem usuários.
 */
export async function listEntriesForExport(
  range: DateRange,
  userIds: string[],
): Promise<ExportEntry[]> {
  if (userIds.length === 0) return [];

  return db
    .select({
      userId: registrosPonto.userId,
      userName: users.name,
      hourlyRateCents: users.hourlyRateCents,
      workDate: registrosPonto.workDate,
      title: registrosPonto.title,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
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
      asc(registrosPonto.workDate),
      asc(registrosPonto.createdAt),
    );
}