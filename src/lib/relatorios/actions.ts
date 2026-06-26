"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { DateRange } from "@/lib/ponto/data";
import { reportByUserMonth, type ReportRow } from "./data";

/**
 * Leitura agregada do relatório de equipe para o client (React Query).
 * Guarda no servidor: exige `ponto:ver_equipe` (só admin). Ver `CLAUDE.md` §6.
 */
export async function fetchReport(
  range: DateRange,
  userIds: string[],
): Promise<ReportRow[]> {
  await requirePermission("ponto:ver_equipe");

  // Saneamento básico: só ids string não-vazios.
  const ids = (Array.isArray(userIds) ? userIds : []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  return reportByUserMonth(range, ids);
}