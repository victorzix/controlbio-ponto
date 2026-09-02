/**
 * Escolha da Lista (sprint) que vai receber o ponto — spec 011, RF-06/RF-07.
 *
 * Ordem de confiança:
 *   1. data da própria Lista (`start_date`/`due_date`) — fonte confiável;
 *   2. parse do NOME da Lista — rede de segurança, porque os nomes reais usam
 *      formatos diferentes por frente (dia/mês em GPA, mês/dia em RPA/AFA) e
 *      alguns não têm data nenhuma;
 *   3. Lista de backlog configurada — e o ponto é sinalizado na UI.
 *
 * Tudo em datas "YYYY-MM-DD" (sem hora) para não sofrer com fuso — mesma decisão
 * de `registros_ponto.work_date` (spec 003).
 */

import { brasiliaDateISO } from "@/lib/tz";

export type SprintDateFormat = "dmy" | "mdy";

export type ClickUpList = {
  id: string;
  name: string;
  startDate: Date | null;
  dueDate: Date | null;
};

export type SprintPick = {
  listId: string;
  /** Como o destino foi decidido — vira o aviso "sprint não resolvida" na UI. */
  source: "list_date" | "list_name" | "backlog";
};

/** Captura "(1/9/26 - 15/9/26)" ou "(8/24 - 9/6)" no fim ou no meio do nome. */
const WINDOW_RE =
  /\((\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\)/;

function toISO(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** "26" -> 2026; "2026" -> 2026. */
function expandYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

export function parseSprintWindow(
  name: string,
  format: SprintDateFormat,
  referenceISO: string,
): { start: string; end: string } | null {
  const m = WINDOW_RE.exec(name);
  if (!m) return null;

  const [, a1, a2, aYear, b1, b2, bYear] = m;
  // "dmy" => primeiro número é dia; "mdy" => primeiro número é mês.
  const startDay = Number(format === "dmy" ? a1 : a2);
  const startMonth = Number(format === "dmy" ? a2 : a1);
  const endDay = Number(format === "dmy" ? b1 : b2);
  const endMonth = Number(format === "dmy" ? b2 : b1);

  if (
    startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12 ||
    startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31
  ) {
    return null;
  }

  const refYear = Number(referenceISO.slice(0, 4));
  const refMonth = Number(referenceISO.slice(5, 7));

  // Sem ano no nome, inferimos do dia trabalhado. O caso chato é a virada:
  // ponto em janeiro numa sprint que começou em dezembro (e vice-versa).
  let sy = aYear ? expandYear(aYear) : refYear;
  let ey = bYear ? expandYear(bYear) : refYear;

  if (!aYear && !bYear) {
    if (refMonth === 1 && startMonth === 12) sy = refYear - 1;
    if (refMonth === 12 && endMonth === 1) ey = refYear + 1;
    // Janela que cruza o ano sem referência ambígua (ex.: 22/12 - 5/1).
    if (sy === ey && startMonth === 12 && endMonth === 1) ey = sy + 1;
  }

  return { start: toISO(sy, startMonth, startDay), end: toISO(ey, endMonth, endDay) };
}

/**
 * Janela "YYYY-MM-DD" de uma Lista, na mesma ordem de confiança de
 * `pickSprintList`: data da própria Lista primeiro, parse do nome como rede de
 * segurança. `null` para Lista sem data nenhuma (o backlog é o caso normal).
 *
 * Existe para o pipeline poder **ordenar** sprints no tempo — comparar a sprint
 * de destino com a sprint onde a tarefa vive hoje (carry over só para a frente,
 * RF-17) e achar a sprint imediatamente anterior ao destino, que é o alcance
 * real da busca por título.
 */
export function listWindow(
  list: ClickUpList,
  format: SprintDateFormat,
  referenceISO: string,
): { start: string; end: string } | null {
  if (list.startDate && list.dueDate) {
    return {
      start: brasiliaDateISO(list.startDate),
      end: brasiliaDateISO(list.dueDate),
    };
  }
  return parseSprintWindow(list.name, format, referenceISO);
}

export function pickSprintList(
  lists: ClickUpList[],
  workDate: string,
  format: SprintDateFormat,
  backlogListId: string,
): SprintPick {
  const candidates = lists.filter((l) => l.id !== backlogListId);

  // 1. Data da própria Lista — a fonte confiável. Convertida para a data civil
  // em Brasília (não UTC): o ClickUp guarda start_date/due_date como epoch ms,
  // e uma sprint que termina 15/09 23:59 em Brasília cai em 16/09 em UTC — usar
  // toISOString() alargaria a janela em um dia e roteria errado o ponto do 16.
  for (const l of candidates) {
    if (!l.startDate || !l.dueDate) continue;
    const start = brasiliaDateISO(l.startDate);
    const due = brasiliaDateISO(l.dueDate);
    if (start <= workDate && workDate <= due) {
      return { listId: l.id, source: "list_date" };
    }
  }

  // 2. Nome da Lista — rede de segurança.
  for (const l of candidates) {
    const w = parseSprintWindow(l.name, format, workDate);
    if (w && w.start <= workDate && workDate <= w.end) {
      return { listId: l.id, source: "list_name" };
    }
  }

  // 3. Backlog — e a UI sinaliza "sprint não resolvida".
  return { listId: backlogListId, source: "backlog" };
}
