// S20 · PR 408 — the print quality rules (Blueprint B2.4) on every document at every size the owner can choose: the
// sticker at each sticker size and both printer dots, the paper lists (picking list, handover sheet) on A4 and A5, the
// invoice on A4, A5 and both rolls — each with long, worst-case words — nothing cut, nothing wider than its box, nothing
// over other text, no ink in the outer band, black-and-white safe. And the checks themselves catch each fault.
import { describe, expect, it } from 'vitest';
import { invoicePages, ROLL_MM, type InvoiceDocument } from './invoice';
import { overlaps, Sheet } from './layout';
import { listPages, PAPER_MM, type ListDocument } from './list';
import { pageQuality, printQuality } from './quality';
import { stickerPages, type StickerLayout } from './sticker';
import { boxText, sampleSticker, SAMPLE_WORDS } from './test-kit';

const STICKERS: [number, number][] = [
  [100, 150],
  [100, 100],
  [75, 100],
  [105, 148],
  [148, 210],
  [105, 148.5],
];
const LONG = 'Abdur Rahman Chowdhury Siddiqui of the Long Name Family';
const ADDRESS = 'House 123/A, Road 45, Block C, Section 12, Mirpur, near the big mosque and the school gate, Dhaka 1216';

const list = (paper: 'a4' | 'a5', rows: number): ListDocument => ({
  widthMm: PAPER_MM[paper][0],
  heightMm: PAPER_MM[paper][1],
  dpi: 150,
  letterhead: ['Sample Shop', ADDRESS, '01700-000000'], // hardcode-ok: a made-up test number
  title: 'Picking list · 1 Nov 2026',
  summary: ['42 orders · 97 pieces', 'Printed 1 Nov 2026, 09:00'],
  columns: [
    { title: '#', width: 1 },
    { title: 'Order', width: 3 },
    { title: 'Consignment', width: 4 },
    { title: 'Receiver', width: 4 },
    { title: 'Pcs', width: 1.5, align: 'right' },
    { title: 'Collect', width: 3, align: 'right' },
  ],
  rows: Array.from({ length: rows }, (_, i) => ({ cells: [String(i + 1), `EX-${100000 + i}`, `99001234567${i}`, LONG, '12', 'Tk 123,456'], tick: true })),
  after: ['Total to collect: Tk 9,999,999 (99 parcels)'],
  signatures: ['Handed over by (shop)', 'Received by (rider): name and signature'],
  foot: 'Batch 0000ABCD · print 1',
  pageWords: '{n}/{of}',
});

const invoice = (): InvoiceDocument => ({
  brand: 'Sample Shop',
  shopLines: ['Sample slogan for a menswear shop', ADDRESS],
  heading: 'Invoice',
  meta: ['INV-104299', 'Order #104299', '23 Oct 2026', 'Revised 2'],
  stamp: 'REVISED 2',
  barcode: { value: '99001234567', caption: 'Courier · 99001234567' },
  parties: [
    { label: 'Billed to', strong: LONG, lines: ['01711-111111'] }, // hardcode-ok: a made-up test number
    { label: 'Deliver to', lines: [ADDRESS] },
  ],
  cols: { no: '#', item: 'Item', qty: 'Qty', unit: 'Price', amount: 'Amount' },
  rows: Array.from({ length: 14 }, (_, i) => ({ no: String(i + 1), name: `${LONG} shirt ${i + 1}`, subs: ['Sky blue · XXL'], marks: i === 0 ? ['Added'] : [], qty: '12', unit: 'Tk 12,500', amount: 'Tk 150,000' })),
  totals: [
    { label: 'Subtotal', value: 'Tk 2,100,000' },
    { label: 'Discount', value: '− Tk 100,000', kind: 'disc' },
    { label: 'Total', value: 'Tk 2,000,080', kind: 'total' },
  ],
  payment: { title: 'Payment: Cash on Delivery', lines: ['Tk 2,000,080 to pay the rider'] },
  note: ['Thank you for shopping with us. Exchange within 7 days with this invoice.'],
  footer: ['Computer-generated invoice', ADDRESS],
  pageWords: 'Page {n}/{of}',
});

describe('PR 408 · print quality on every document at every size', () => {
  it('the sticker at every size and both printer dots, with a long name, address and many pieces', async () => {
    for (const [w, h] of STICKERS)
      for (const dpi of [203, 300]) {
        const layout: StickerLayout = { widthMm: w, heightMm: h, dpi, scale: 1, minScale: 0.8 };
        const pages = await stickerPages(sampleSticker({
            receiver: { name: LONG, phone: '01711111111', address: ADDRESS, addressLatin: ADDRESS }, // hardcode-ok: a made-up test number
            note: ADDRESS,
            items: Array.from({ length: 6 }, (_, i) => ({ name: `${LONG} ${i + 1}`, colour: 'Sky blue', size: 'XXL', quantity: 2 })),
          }), SAMPLE_WORDS, layout, boxText());
        expect({ size: `${w}x${h}@${dpi}`, ...printQuality(pages, { edgeMm: 2 }) }).toEqual({ size: `${w}x${h}@${dpi}`, pages: pages.length, problems: [] });
      }
  });

  it('the paper lists on A4 and A5, one page and many pages', async () => {
    for (const paper of ['a4', 'a5'] as const)
      for (const rows of [3, 80]) {
        const pages = await listPages(list(paper, rows), boxText());
        expect({ paper, rows, ...printQuality(pages, { edgeMm: 2 }) }).toEqual({ paper, rows, pages: pages.length, problems: [] });
      }
  });

  it('the invoice on A4, A5 and both thermal rolls', async () => {
    const papers = [
      { kind: 'page', widthMm: PAPER_MM.a4[0], heightMm: PAPER_MM.a4[1] },
      { kind: 'page', widthMm: PAPER_MM.a5[0], heightMm: PAPER_MM.a5[1] },
      { kind: 'roll', widthMm: ROLL_MM.roll80 },
      { kind: 'roll', widthMm: ROLL_MM.roll58 },
    ] as const;
    for (const paper of papers) {
      const pages = await invoicePages(invoice(), paper, 203, boxText());
      expect({ paper: paper.widthMm, ...printQuality(pages, { edgeMm: 2 }) }).toEqual({ paper: paper.widthMm, pages: pages.length, problems: [] });
    }
  });

  it('the checks catch each fault: cut, wider than its box, text over text, ink at the edge, faint ink', async () => {
    const e = boxText();
    const clean = new Sheet(50, 30, 203, e);
    await clean.text('fine', clean.px(5), clean.px(5), clean.px(30), { sizePt: 9 });
    expect(pageQuality(await clean.render(), { edgeMm: 2 }).problems).toEqual([]);

    const cut = new Sheet(50, 30, 203, e);
    await cut.text('falls off the page', cut.px(45), cut.px(5), cut.px(30), { sizePt: 9 });
    expect(pageQuality(await cut.render(), { edgeMm: 0 }).problems).toContain('CUT');

    const wide = new Sheet(50, 30, 203, e);
    const block = await wide.shape('a long line drawn wide', { sizePt: 9 }, wide.px(40));
    wide.place(block, wide.px(5), wide.px(5), wide.px(10));
    expect(pageQuality(await wide.render(), { edgeMm: 2 }).problems).toEqual(['OVERFLOW']);

    const over = new Sheet(50, 30, 203, e);
    await over.text('one', over.px(5), over.px(5), over.px(20), { sizePt: 9 });
    await over.text('two', over.px(6), over.px(6), over.px(20), { sizePt: 9 });
    expect(pageQuality(await over.render(), { edgeMm: 2 }).problems).toEqual(['OVERLAP']);
    expect(overlaps([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }])).toBe(0);

    const edge = new Sheet(50, 30, 203, e);
    edge.line(0, edge.px(10), edge.px(50), edge.px(10), 3);
    const q = pageQuality(await edge.render(), { edgeMm: 2 });
    expect(q.problems).toEqual(['EDGE_INK']);
    expect(q.edgeInk).toBeGreaterThan(0);
    expect(pageQuality(await edge.render(), { edgeMm: 0 }).problems).toEqual([]);

    const grey = { widthPt: 72, heightPt: 72, image: { width: 100, height: 100, gray: Buffer.alloc(10_000, 255) } };
    for (let i = 4000; i < 6000; i++) grey.image.gray[i] = 160;
    expect(pageQuality(grey, { edgeMm: 2 })).toMatchObject({ problems: ['FAINT'], faintShare: 1 });
  });
});
