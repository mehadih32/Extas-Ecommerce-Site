import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sharpText } from './layout';
import { PAPER_MM, listPages, listPdf, type ListDocument, type ListRow } from './list';
import { boxText, readPdf } from './test-kit';

const rows = (n: number): ListRow[] => Array.from({ length: n }, (_, i) => ({ cells: [`Row ${i + 1}`, `${i + 1}`], tick: true }));

const doc = (o: Partial<ListDocument> = {}): ListDocument => ({
  widthMm: PAPER_MM.a4[0],
  heightMm: PAPER_MM.a4[1],
  dpi: 96,
  letterhead: ['Sample Shop', null, 'Sample address'],
  title: 'Handover sheet',
  summary: ['3 parcels'],
  columns: [
    { title: 'Item', width: 3 },
    { title: 'Qty', width: 1, align: 'right' },
  ],
  rows: rows(3),
  after: ['Total 3'],
  signatures: ['Handed over by', 'Received by'],
  foot: 'Batch 1',
  pageWords: '{n}/{of}',
  empty: 'Nothing to list',
  ...o,
});

describe('the paper list', () => {
  it('puts the letterhead and the header row on every page, the title only on the first, and signatures at the end', async () => {
    const engine = boxText();
    const pages = await listPages(doc({ rows: rows(120) }), engine);
    expect(pages.length).toBeGreaterThan(1);
    const count = (text: string) => engine.calls.filter((c) => c === text).length;
    // measured once, drawn on every page (the same shaped block is placed again)
    expect(count('Sample Shop')).toBe(1);
    expect(count('Handover sheet')).toBe(1);
    expect(count('Received by')).toBe(1);
    // every row is shaped once: nothing is dropped
    for (let i = 1; i <= 120; i++) expect(engine.calls).toContain(`Row ${i}`);
    // the foot line carries the batch and n/of on every page
    for (let p = 1; p <= pages.length; p++) expect(engine.calls).toContain(`Batch 1 · ${p}/${pages.length}`);
  });

  it('fits a short list on one page and leaves empty letterhead lines out', async () => {
    const engine = boxText();
    const pages = await listPages(doc(), engine);
    expect(pages).toHaveLength(1);
    expect(engine.calls).toContain('Batch 1 · 1/1');
    expect(engine.calls.filter((c) => c === '')).toHaveLength(0);
  });

  it('says so when there is nothing to list', async () => {
    const engine = boxText();
    const pages = await listPages(doc({ rows: [] }), engine);
    expect(pages).toHaveLength(1);
    expect(engine.calls).toContain('Nothing to list');
  });

  it('draws marks in a black box and the tick boxes', async () => {
    const engine = boxText();
    const [page] = await listPages(doc({ rows: [{ cells: ['Shirt', '2'], mark: 'SHORT 1', tick: true, bold: true }] }), engine);
    expect(engine.calls).toContain('SHORT 1');
    // a black box was drawn: the page has fully black pixels
    expect([...page!.image.gray].some((v) => v === 0)).toBe(true);
  });

  it('writes a PDF with one page per sheet at the paper size', async () => {
    const pdf = await listPdf(doc({ rows: rows(80) }), boxText(), { created: new Date('2026-10-24T00:00:00Z') });
    const read = readPdf(pdf);
    expect(read.xrefOk).toBe(true);
    expect(read.pages.length).toBeGreaterThan(1);
    expect(read.pages[0]!.mediaBox.map(Math.round)).toEqual([0, 0, 595, 842]);
    expect(read.title).toBe('Handover sheet');
  });

  it('draws real Bengali text with the server fonts', async () => {
    const pdf = await listPdf(
      doc({ title: 'রাইডারের হ্যান্ডওভার শিট', summary: ['৩টা পার্সেল · মোট কালেকশন ৳২,৪০০'], rows: [{ cells: ['শার্ট — নীল — M', '2'], tick: true, mark: 'কম ১' }], dpi: 150 }),
      sharpText(),
    );
    if (process.env.LIST_PDF_OUT) writeFileSync(process.env.LIST_PDF_OUT, pdf);
    const read = readPdf(pdf);
    expect(read.pages).toHaveLength(1);
    const ink = [...read.pages[0]!.image.gray].filter((v) => v < 128).length;
    expect(ink).toBeGreaterThan(1000);
  });

  it('PR 408: prints the shop\'s logo in place of its name when one is given (the same letterhead as the invoice); an unreadable logo prints the name', async () => {
    const logo = await sharp({ create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const named = boxText();
    await listPages(doc({ logo: null }), named);
    expect(named.calls).toContain('Sample Shop');
    const withLogo = boxText();
    const pages = await listPages(doc({ logo }), withLogo);
    expect(withLogo.calls).not.toContain('Sample Shop');
    expect(withLogo.calls).toContain('Sample address');
    // the logo's black box is on the page's top band
    const top = pages[0]!.image.gray.subarray(0, pages[0]!.image.width * Math.round(pages[0]!.image.height / 8));
    expect(top.some((v) => v === 0)).toBe(true);
    const broken = boxText();
    await listPages(doc({ logo: Buffer.from('not a picture') }), broken);
    expect(broken.calls).toContain('Sample Shop');
  });
});
