/**
 * Helpers de fuso de **Brasília** (America/Sao_Paulo).
 *
 * O tracking de tempo (spec 010) exige que todas as datas consideradas usem o
 * fuso de Brasília — diferente do `todayISODate()` de `lib/ponto/validation.ts`,
 * que segue o fuso do **servidor**. Usamos `Intl` com `timeZone` para derivar a
 * data civil correta em Brasília, independentemente de onde a app roda.
 */
export const BRASILIA_TZ = "America/Sao_Paulo";

// "en-CA" formata como "YYYY-MM-DD" — conveniente para o formato ISO de data.
const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRASILIA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Data civil (YYYY-MM-DD) de um instante **no fuso de Brasília**.
 * Default: agora. Base do `work_date` de cada ponto gerado (RN-14): um segmento
 * iniciado às 23:50 conta no dia em que começou, mesmo cruzando a meia-noite.
 */
export function brasiliaDateISO(date: Date = new Date()): string {
  return isoDateFmt.format(date);
}

/** Hoje (YYYY-MM-DD) em Brasília. */
export function todayBrasiliaISO(): string {
  return brasiliaDateISO();
}
