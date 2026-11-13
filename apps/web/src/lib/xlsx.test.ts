// S28 · PR 689 — the spreadsheet writer: a real .xlsx (a zip of XML parts), one sheet per part, text as text (a cell that
// starts like a formula stays text), numbers as numbers, sheet names cleaned to what Excel allows.
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sheetName, xlsx } from './xlsx';

/** Reads a zip written with the writer: name -> text (central directory, deflate or stored). */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

describe('PR 689 · the .xlsx writer', () => {
  it('writes the parts Excel needs, one sheet per part', () => {
    const f = unzip(xlsx([{ name: 'Sales', rows: [['Figure', 'Value'], ['Sales', 1250.5]] }, { name: 'Stock', rows: [['Style']] }]));
    expect(Object.keys(f).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    expect(f['xl/workbook.xml']).toContain('name="Sales"');
    expect(f['xl/workbook.xml']).toContain('name="Stock"');
    expect(f['xl/worksheets/sheet1.xml']).toContain('<c r="B2"><v>1250.5</v></c>');
    expect(f['xl/worksheets/sheet1.xml']).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Figure</t></is></c>');
  });
  it('keeps a formula-looking cell as text, escapes markup and keeps Bengali', () => {
    const s = unzip(xlsx([{ name: 'A', rows: [['=SUM(A1)', '<b>&"x"</b>', 'বিক্রি']] }]))['xl/worksheets/sheet1.xml']!;
    expect(s).not.toContain('<f>');
    expect(s).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(s).toContain('বিক্রি');
    expect(s).toContain("'=SUM(A1)");
  });
  it('cleans a sheet name: no : \\ / ? * [ ], at most 31 characters, never empty or repeated', () => {
    expect(sheetName('Orders: by/hour?', [])).toBe('Orders by hour');
    expect(sheetName('x'.repeat(50), []).length).toBe(31);
    expect(sheetName('', [])).toBe('Sheet');
    expect(sheetName('Sales', ['Sales'])).toBe('Sales 2');
  });
});
