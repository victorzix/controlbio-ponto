import { zipStore } from "./zip";

/**
 * Gerador de `.xlsx` mínimo (OOXML, sem dependências) — uma única planilha com
 * estilos básicos (cabeçalho em negrito, data, número com 2 casas) e
 * **autofilter** no cabeçalho. Suficiente para o relatório de horas (spec 006).
 *
 * Modelo de célula:
 *  - `s` texto (inlineStr), `bold` opcional;
 *  - `n` número (formato `#,##0.00`), `bold` opcional;
 *  - `f` fórmula (formato número), com valor de cache opcional, `bold` opcional;
 *  - `d` data ("YYYY-MM-DD", formato `dd/mm/yyyy`);
 *  - `e` vazia.
 *
 * Índices de estilo (cellXfs em `styles.xml`):
 *  0 padrão · 1 negrito · 2 data · 3 número · 4 número+negrito.
 */
export type Cell =
  | { t: "s"; v: string; bold?: boolean }
  | { t: "n"; v: number; bold?: boolean }
  | { t: "f"; f: string; v?: number; bold?: boolean }
  | { t: "d"; v: string }
  | { t: "e" };

export type SheetSpec = {
  /** Nome da aba (≤ 31 chars). */
  name: string;
  /** Larguras das colunas (em "caracteres" do Excel), na ordem das colunas. */
  colWidths: number[];
  /** Linhas, cada uma um array de células (linha 1 costuma ser o cabeçalho). */
  rows: Cell[][];
  /** Referência do autofilter (ex.: "A1:F20"). Omitir = sem filtro. */
  autoFilterRef?: string;
};

/** Excel conta os dias desde 1899-12-30 (inclui o bug histórico de 1900). */
const EPOCH = Date.UTC(1899, 11, 30);

function dateSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000);
}

/** Índice de coluna 0-based → letra(s) ("A", "B", ... "AA"). */
function colName(index: number): string {
  let i = index + 1;
  let s = "";
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellXml(ref: string, cell: Cell): string {
  switch (cell.t) {
    case "e":
      return "";
    case "s":
      return `<c r="${ref}" s="${cell.bold ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    case "n": {
      const v = Number.isFinite(cell.v) ? cell.v : 0;
      return `<c r="${ref}" s="${cell.bold ? 4 : 3}"><v>${v}</v></c>`;
    }
    case "f": {
      const cached = cell.v != null && Number.isFinite(cell.v) ? `<v>${cell.v}</v>` : "";
      return `<c r="${ref}" s="${cell.bold ? 4 : 3}"><f>${esc(cell.f)}</f>${cached}</c>`;
    }
    case "d":
      return `<c r="${ref}" s="2"><v>${dateSerial(cell.v)}</v></c>`;
  }
}

function sheetXml(spec: SheetSpec): string {
  const cols = spec.colWidths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
    )
    .join("");

  const rows = spec.rows
    .map((cells, r) => {
      const rowNum = r + 1;
      const body = cells
        .map((c, ci) => cellXml(`${colName(ci)}${rowNum}`, c))
        .join("");
      return `<row r="${rowNum}">${body}</row>`;
    })
    .join("");

  const autoFilter = spec.autoFilterRef
    ? `<autoFilter ref="${spec.autoFilterRef}"/>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    autoFilter +
    `</worksheet>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2">` +
  `<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>` +
  `<numFmt numFmtId="165" formatCode="#,##0.00"/>` +
  `</numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function workbookXml(sheetName: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

/** Monta o `.xlsx` (uma planilha) e devolve o buffer pronto para download. */
export function buildXlsx(spec: SheetSpec): Buffer {
  const u = (s: string) => Buffer.from(s, "utf8");
  return zipStore([
    { name: "[Content_Types].xml", data: u(CONTENT_TYPES) },
    { name: "_rels/.rels", data: u(RELS) },
    { name: "xl/workbook.xml", data: u(workbookXml(spec.name)) },
    { name: "xl/_rels/workbook.xml.rels", data: u(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: u(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: u(sheetXml(spec)) },
  ]);
}