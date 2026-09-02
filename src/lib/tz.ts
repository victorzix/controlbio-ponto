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

// Hora civil completa em Brasília — usada para descobrir o deslocamento do fuso
// naquele instante. `h23` evita o "24" que alguns ambientes devolvem à
// meia-noite com `hour12: false`.
const wallClockFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRASILIA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Deslocamento (ms) da hora civil de Brasília em relação ao UTC, num instante. */
function brasiliaOffsetMs(instant: Date): number {
  const parts = wallClockFmt.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const comoSeFosseUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return comoSeFosseUTC - instant.getTime();
}

/**
 * Instante correspondente a um dia civil (`YYYY-MM-DD`) + hora **de Brasília**.
 *
 * Existe porque o `work_date` do ponto é um dia sem hora (spec 003) e o ClickUp
 * quer um epoch: o lançamento de tempo (spec 011, RF-18) precisa ancorar o dia
 * trabalhado num horário. Deriva o deslocamento do próprio `Intl` em vez de
 * assumir UTC-3 fixo — assim continua correto se o horário de verão voltar.
 */
export function brasiliaInstant(
  dateISO: string,
  hour: number,
  minute = 0,
): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  // Primeiro fingimos que a hora civil de Brasília é UTC; depois subtraímos o
  // deslocamento real. A segunda passada corrige o caso de a estimativa cair do
  // outro lado de uma mudança de fuso.
  const comoSeFosseUTC = Date.UTC(year, month - 1, day, hour, minute);
  const estimativa = new Date(comoSeFosseUTC - brasiliaOffsetMs(new Date(comoSeFosseUTC)));
  return new Date(comoSeFosseUTC - brasiliaOffsetMs(estimativa));
}
