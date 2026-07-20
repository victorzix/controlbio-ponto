/** Helpers de formatação de tempo do tracking (puros). */

/** ms → "HH:MM:SS" (horas sem teto; sempre 2 dígitos em min/seg). */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * ms → { hours, minutes } **arredondado ao minuto mais próximo**, com mínimo de
 * 1 minuto (RN-11: nenhum segmento some por ser curto). Horas limitadas a 24
 * (o modal revalida; segmentos assim não devem ocorrer na prática).
 */
export function msToHoursMinutes(ms: number): { hours: number; minutes: number } {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

/**
 * Parse flexível de horário digitado no ajuste de início (spec 010):
 * - "HH:MM" (ex.: "23:40")
 * - "HHMM" (ex.: "2340" → 23:40)
 * - "HMM" (ex.: "940" → 9:40)
 * - "H"/"HH" (ex.: "23" → 23:00)
 * Retorna `null` se o horário for inválido (fora de 0–23 / 0–59).
 */
export function parseTimeToHM(str: string): { h: number; m: number } | null {
  const s = str.trim();
  let h: number;
  let m: number;
  if (s.includes(":")) {
    const [hh, mm] = s.split(":");
    h = Number(hh);
    m = Number(mm);
  } else {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 0) return null;
    if (digits.length <= 2) {
      h = Number(digits);
      m = 0;
    } else if (digits.length === 3) {
      h = Number(digits.slice(0, 1));
      m = Number(digits.slice(1));
    } else {
      h = Number(digits.slice(0, 2));
      m = Number(digits.slice(2, 4));
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}
