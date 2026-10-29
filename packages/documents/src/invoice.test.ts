// PR 407 — the printed invoice: the letterhead on every page, the header row repeated, every line kept (none dropped,
// none split), the courier barcode only with a consignment id, a hidden-price gift without prices, a roll as long as
// the invoice, a bulk print with each invoice on its own pages, and the chat picture as one JPG. The font-free engine
// keeps the checks exact; one test draws with the server's real fonts. Every value is a made-up test value.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { invoiceJpeg, invoicePages, invoicePdf, ROLL_MM, type InvoiceDocument } from './invoice';
import { sharpText } from './layout';
import { PAPER_MM } from './list';
import { boxText, readPdf } from './test-kit';

const A4 = { kind: 'page', widthMm: PAPER_MM.a4[0], heightMm: PAPER_MM.a4[1] } as const;

const doc = (o: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
  brand: 'Sample Shop',
  shopLines: ['Sample slogan', '', 'Sample address'],
  heading: 'Invoice',
  meta: ['INV-1042', 'Order #1042', '23 Oct 2026'],
  parties: [
    { label: 'Billed to', strong: 'Rahim Uddin', lines: ['01711-111111'] }, // hardcode-ok: a made-up test number
    { label: 'Deliver to', lines: ['House 4, Road 2, Dhanmondi'] },
  ],
  cols: { no: '#', item: 'Item', qty: 'Qty', unit: 'Price', amount: 'Amount' },
  rows: [{ no: '1', name: 'Linen shirt', subs: ['White · M'], marks: ['Added'], qty: '1', unit: 'Tk 1,500', amount: 'Tk 1,500' }],
  totals: [
    { label: 'Subtotal', value: 'Tk 1,500' },
    { label: 'Total', value: 'Tk 1,580', kind: 'total' },
  ],
  payment: { title: 'Payment: Cash on Delivery', lines: ['Tk 1,580 to pay the rider'] },
  note: ['Thank you'],
  footer: ['Computer-generated invoice'],
  pageWords: 'Page {n}/{of}',
  ...o,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ no: String(i + 1), name: `Piece ${i + 1}`, subs: ['Sky · L'], marks: [], qty: '1', unit: 'Tk 100', amount: 'Tk 100' }));

describe('the printed invoice (PR 407)', () => {
  it('fits a short invoice on one A4 page with every block, the page number and no empty line', async () => {
    const engine = boxText();
    const pages = await invoicePages(doc(), A4, 96, engine);
    expect(pages).toHaveLength(1);
    for (const t of ['Sample Shop', 'Sample slogan', 'Invoice', 'INV-1042', 'Billed to', 'Rahim Uddin', 'Linen shirt', 'White · M', 'Added', 'Total', 'Tk 1,580', 'Payment: Cash on Delivery', 'Thank you', 'Computer-generated invoice', 'Page 1/1']) expect(engine.calls).toContain(t);
    expect(engine.calls.filter((c) => c === '')).toHaveLength(0);
  });

  it('carries a long invoice onto more pages: the letterhead and the header row on each, every line once, n/of on each', async () => {
    const engine = boxText();
    const pages = await invoicePages(doc({ rows: many(90) }), A4, 96, engine);
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 1; i <= 90; i++) expect(engine.calls.filter((c) => c === `Piece ${i}`)).toHaveLength(1);
    // shaped once, placed on every page
    expect(engine.calls.filter((c) => c === 'Sample Shop')).toHaveLength(1);
    expect(engine.calls.filter((c) => c === 'Amount')).toHaveLength(1);
    for (let p = 1; p <= pages.length; p++) expect(engine.calls).toContain(`Page ${p}/${pages.length}`);
  });

  it('prints the barcode only with the courier’s id, and a revised version carries its mark', async () => {
    const engine = boxText();
    const plain = await invoicePages(doc(), A4, 96, engine);
    const withCode = await invoicePages(doc({ barcode: { value: '12345678', caption: 'Courier · 12345678' }, stamp: 'REVISED 2' }), A4, 96, engine);
    expect(engine.calls).toContain('Courier · 12345678');
    expect(engine.calls).toContain('REVISED 2');
    // the barcode's bars make the page darker than the same page without it
    const ink = (g: Buffer) => g.reduce((s, v) => s + (255 - v), 0);
    expect(ink(withCode[0]!.image.gray)).toBeGreaterThan(ink(plain[0]!.image.gray));
  });

  it('a gift with hidden prices has no price columns', async () => {
    const engine = boxText();
    await invoicePages(doc({ prices: false, totals: [], rows: [{ no: '1', name: 'Gift piece', subs: [], marks: [], qty: '1', unit: 'Tk 900', amount: 'Tk 900' }] }), A4, 96, engine);
    expect(engine.calls).toContain('Gift piece');
    expect(engine.calls).not.toContain('Tk 900');
    expect(engine.calls).not.toContain('Price');
  });

  it('a roll is one page as wide as the roll and as long as the invoice', async () => {
    const short = await invoicePages(doc(), { kind: 'roll', widthMm: ROLL_MM.roll80 }, 203, boxText());
    const long = await invoicePages(doc({ rows: many(30) }), { kind: 'roll', widthMm: ROLL_MM.roll80 }, 203, boxText());
    expect(short).toHaveLength(1);
    expect(long).toHaveLength(1);
    expect(short[0]!.widthPt).toBeCloseTo((80 * 72) / 25.4, 1);
    expect(long[0]!.heightPt).toBeGreaterThan(short[0]!.heightPt);
    const narrow = await invoicePages(doc(), { kind: 'roll', widthMm: ROLL_MM.roll58 }, 203, boxText());
    expect(narrow[0]!.widthPt).toBeCloseTo((58 * 72) / 25.4, 1);
  });

  it('a bulk print puts each invoice on its own pages in one PDF', async () => {
    const pdf = await invoicePdf([doc(), doc({ meta: ['INV-1043'] }), doc({ rows: many(90) })], A4, 96, boxText(), { title: 'Invoices', created: new Date('2026-10-23T08:00:00Z') });
    const r = readPdf(pdf);
    expect(r.xrefOk).toBe(true);
    expect(r.title).toBe('Invoices');
    expect(r.pages.length).toBeGreaterThanOrEqual(4);
  });

  it('the chat copy is one JPG picture of the requested width', async () => {
    const jpg = await invoiceJpeg(doc(), { widthMm: PAPER_MM.a4[0], widthPx: 800, quality: 80 }, boxText());
    const m = await sharp(jpg).metadata();
    expect(m.format).toBe('jpeg');
    expect(Math.abs((m.width ?? 0) - 800)).toBeLessThanOrEqual(4);
    expect(m.height ?? 0).toBeGreaterThan(200);
  });

  it('prints the logo instead of the name when there is one; a broken logo falls back to the name', async () => {
    const logo = await sharp({ create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const withLogo = boxText();
    await invoicePages(doc({ logo }), A4, 96, withLogo);
    expect(withLogo.calls).not.toContain('Sample Shop');
    const broken = boxText();
    await invoicePages(doc({ logo: Buffer.from('not a picture') }), A4, 96, broken);
    expect(broken.calls).toContain('Sample Shop');
  });

  it('draws Bengali with the server’s fonts', async () => {
    const pages = await invoicePages(doc({ heading: 'ইনভয়েস', rows: [{ no: '১', name: 'লিনেন শার্ট', subs: [], marks: [], qty: '1', unit: '৳ 1,500', amount: '৳ 1,500' }] }), A4, 96, sharpText()); // hardcode-ok: a made-up test amount
    expect(pages).toHaveLength(1);
    expect(pages[0]!.image.gray.some((v) => v < 128)).toBe(true);
  });
});
