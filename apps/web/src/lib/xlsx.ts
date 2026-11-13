// S28 · PR 689 — a small spreadsheet writer: rows in, a real .xlsx (a zip of XML parts, one sheet per part) out. Text goes in
// as text (a cell that starts like a formula gets a leading quote so Excel never runs it), numbers as numbers. No library: the
// zip is written by hand with Node's own deflate and CRC, so the report packs can be opened in Excel as they are.
import { crc32, deflateRawSync } from 'node:zlib';

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

const SHEET_NAME_MAX = 31; // Excel's own limit on a sheet name

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A name Excel accepts: none of : \ / ? * [ ], at most 31 characters, never empty and never one the workbook already has. */
export function sheetName(raw: string, taken: readonly string[]): string {
  const base = raw.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SHEET_NAME_MAX).trim() || 'Sheet';
  let name = base;
  for (let n = 2; taken.some((t) => t.toLowerCase() === name.toLowerCase()); n++) name = `${base.slice(0, SHEET_NAME_MAX - String(n).length - 1)} ${n}`;
  return name;
}

const col = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((r, y) => {
      const cells = r
        .map((v, x) => {
          if (v === null || v === '') return '';
          const ref = `${col(x)}${y + 1}`;
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
          const text = String(v);
          const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(safe)}</t></is></c>`;
        })
        .join('');
      return `<row r="${y + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

interface Part {
  name: string;
  data: Buffer;
}

function zip(parts: Part[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8');
    const packed = deflateRawSync(p.data);
    const crc = crc32(p.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(p.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    locals.push(head, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(p.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** The workbook as .xlsx bytes. At least one sheet. */
export function xlsx(sheets: Sheet[]): Buffer {
  const list = sheets.length ? sheets : [{ name: 'Sheet', rows: [] }];
  const names: string[] = [];
  for (const s of list) names.push(sheetName(s.name, names));
  const xml = (s: string) => Buffer.from(s, 'utf8');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const parts: Part[] = [
    {
      name: '[Content_Types].xml',
      data: xml(
        `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('')}</Types>`,
      ),
    },
    { name: '_rels/.rels', data: xml(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    {
      name: 'xl/workbook.xml',
      data: xml(`${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: xml(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml(sheetXml(s.rows)) })),
  ];
  return zip(parts);
}
