/**
 * Escritor de ZIP mínimo, método **store** (sem compressão) — suficiente para
 * empacotar um `.xlsx` (que é um zip OOXML) sem nenhuma dependência. Excel abre
 * normalmente arquivos armazenados sem deflate. Ver `src/lib/xlsx/sheet.ts`.
 */

/** Tabela CRC-32 (polinômio 0xEDB88320), pré-calculada uma vez. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data/hora no formato DOS (campos do cabeçalho do zip). */
function dosDateTime(d: Date): { time: number; date: number } {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export type ZipEntry = { name: string; data: Buffer };

/** Empacota os arquivos num ZIP (store) e devolve o buffer final. */
export function zipStore(files: ZipEntry[]): Buffer {
  const { time, date } = dosDateTime(new Date());
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura local file header
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // método: 0 = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // tamanho comprimido
    local.writeUInt32LE(size, 22); // tamanho original
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    locals.push(local, nameBuf, f.data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); // assinatura central directory
    cen.writeUInt16LE(20, 4); // versão criadora
    cen.writeUInt16LE(20, 6); // versão necessária
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(size, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30); // extra
    cen.writeUInt16LE(0, 32); // comentário
    cen.writeUInt16LE(0, 34); // disco inicial
    cen.writeUInt16LE(0, 36); // atributos internos
    cen.writeUInt32LE(0, 38); // atributos externos
    cen.writeUInt32LE(offset, 42); // offset do local header
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + f.data.length;
  }

  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(central);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(0, 4); // disco
  eocd.writeUInt16LE(0, 6); // disco do início do CD
  eocd.writeUInt16LE(files.length, 8); // entradas neste disco
  eocd.writeUInt16LE(files.length, 10); // entradas totais
  eocd.writeUInt32LE(centralBuf.length, 12); // tamanho do CD
  eocd.writeUInt32LE(localBuf.length, 16); // offset do CD
  eocd.writeUInt16LE(0, 20); // comentário

  return Buffer.concat([localBuf, centralBuf, eocd]);
}