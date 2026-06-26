import { buildXlsx, type Cell } from "@/lib/xlsx/sheet";
import type { ExportEntry } from "./data";

/**
 * Monta o `.xlsx` do relatório de horas (spec 006): uma planilha, uma linha por
 * entrada, ordenada por usuário e depois por data, com **autofilter** no
 * cabeçalho e **um único total** ao fim.
 *
 * O total usa `SUBTOTAL(9, ...)`, que ignora as linhas escondidas pelo filtro —
 * então, ao filtrar por usuário (ou data) no Excel, o total **recalcula sozinho**
 * com base no que está visível (RN-06).
 *
 * Colunas: Usuário · Data · Título · Horas · Valor estimado · Descrição.
 * Horas em número decimal (h) e valor em R$ (número) — ambos somáveis.
 */
export function buildReportWorkbook(entries: ExportEntry[]): Buffer {
  const rows: Cell[][] = [];

  // Cabeçalho (negrito) — linha 1.
  rows.push([
    { t: "s", v: "Usuário", bold: true },
    { t: "s", v: "Data", bold: true },
    { t: "s", v: "Título", bold: true },
    { t: "s", v: "Horas", bold: true },
    { t: "s", v: "Valor estimado (R$)", bold: true },
    { t: "s", v: "Descrição", bold: true },
  ]);

  let grandMinutes = 0;
  let grandValueCents = 0;

  for (const e of entries) {
    const valueCents =
      e.hourlyRateCents != null
        ? Math.round((e.workedMinutes * e.hourlyRateCents) / 60)
        : null;
    grandMinutes += e.workedMinutes;
    if (valueCents != null) grandValueCents += valueCents;

    rows.push([
      { t: "s", v: e.userName },
      { t: "d", v: e.workDate },
      { t: "s", v: e.title },
      { t: "n", v: round2(e.workedMinutes / 60) },
      valueCents != null ? { t: "n", v: round2(valueCents / 100) } : { t: "e" },
      { t: "s", v: e.description },
    ]);
  }

  // Linha 1 = cabeçalho; dados em 2..(1+N). O filtro cobre só cabeçalho + dados.
  const lastDataRow = 1 + entries.length;
  const autoFilterRef = `A1:F${Math.max(1, lastDataRow)}`;

  // Total geral (fora do filtro), com SUBTOTAL para acompanhar o filtro.
  if (entries.length > 0) {
    rows.push([
      { t: "s", v: "Total geral", bold: true },
      { t: "e" },
      { t: "e" },
      {
        t: "f",
        f: `SUBTOTAL(9,D2:D${lastDataRow})`,
        v: round2(grandMinutes / 60),
        bold: true,
      },
      {
        t: "f",
        f: `SUBTOTAL(9,E2:E${lastDataRow})`,
        v: round2(grandValueCents / 100),
        bold: true,
      },
      { t: "e" },
    ]);
  }

  return buildXlsx({
    name: "Horas",
    colWidths: [22, 12, 30, 8, 18, 60],
    rows,
    autoFilterRef,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}