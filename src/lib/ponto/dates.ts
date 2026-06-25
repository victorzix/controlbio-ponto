/** Parse "YYYY-MM-DD" como data **local** (evita o shift de fuso de `new Date(iso)`). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → "YYYY-MM-DD". */
function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Intervalo da semana atual (segunda a domingo) relativo a `todayIso`. */
export function getWeekRange(todayIso: string): { from: string; to: string } {
  const today = parseLocalDate(todayIso);
  const mondayOffset = (today.getDay() + 6) % 7; // 0 = segunda
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

/** Intervalo do mês atual (1º ao último dia) relativo a `todayIso`. */
export function getMonthRange(todayIso: string): { from: string; to: string } {
  const today = parseLocalDate(todayIso);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toISO(first), to: toISO(last) };
}

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Rótulo amigável para a data de um registro, relativo a `todayIso`:
 * - "Hoje" / "Ontem";
 * - o **dia da semana** (ex.: "Segunda-feira") se cair na **semana atual**
 *   (semana começando na segunda);
 * - a data **por extenso** ("21 de junho de 2026") caso contrário.
 */
export function formatEntryDateLabel(iso: string, todayIso: string): string {
  const date = parseLocalDate(iso);
  const today = parseLocalDate(todayIso);
  const diffDays = Math.round(
    (today.getTime() - date.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";

  // Início da semana atual (segunda-feira).
  const mondayOffset = (today.getDay() + 6) % 7; // 0 = segunda
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - mondayOffset);

  if (date.getTime() >= startOfWeek.getTime()) {
    const wd = weekdayFmt.format(date);
    return wd.charAt(0).toUpperCase() + wd.slice(1);
  }

  return fullFmt.format(date);
}
