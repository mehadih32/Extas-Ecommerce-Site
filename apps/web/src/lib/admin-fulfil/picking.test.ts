// S08 · PR 181 — the daily picking list as the paper list's data, and as a real PDF: the summary line (orders and pieces
// apart, line items, categories in order, shortages, held orders), category → style → colour → size rows with a tick
// box on every size row and SHORT where the stock is short, the held orders at the end, both languages.
import { describe, expect, it } from 'vitest';
import { readPdf, boxText } from '@extas/documents/test-kit';
import { shippingSettings } from '@extas/settings';
import { groupPicking, type PickingList } from '@extas/shipping';
import { pickingDocument, pickingPdf } from './picking';

const CFG = shippingSettings['delivery.picking.list'].default;
const HEAD = { name: 'Sample Shop', address: 'Sample address', phone: null };
const groups = groupPicking(
  [
    { category: 'Polo', styleKey: 'p1', style: 'Ralph Lauren polo', colour: 'Black', size: 'M', variantId: 'v1', quantity: 2 },
    { category: 'Polo', styleKey: 'p1', style: 'Ralph Lauren polo', colour: 'Black', size: 'L', variantId: 'v2', quantity: 1 },
    { category: '', styleKey: 'p2', style: 'Gift box', colour: null, size: null, variantId: null, quantity: 1 },
  ],
  new Map([
    ['v1', 1],
    ['v2', 5],
  ]),
);
const list = (over: Partial<PickingList> = {}): PickingList => ({
  groups,
  categoryBn: { Polo: 'পোলো' },
  summary: { orders: 2, pieces: 4, lineItems: 3, categories: [{ name: 'Polo', nameBn: 'পোলো', pieces: 3 }, { name: '', nameBn: null, pieces: 1 }], shortages: 1, shortPieces: 1, held: 1, pulled: 0 },
  held: [{ orderId: 'o9', orderNumber: 'EX-1009', reason: 'ON_HOLD', pieces: 2 }],
  orderIds: ['o1', 'o2'],
  range: { from: null, to: null },
  shortagesMarked: true,
  ...over,
});
const AT = '2026-10-24T05:30:00.000Z';

describe('PR 181 · the picking list document', () => {
  it('prints the summary line, then category → style → colour → size with a tick box per size and SHORT where short', () => {
    const doc = pickingDocument(list(), CFG, HEAD, 'Asia/Dhaka', AT);
    expect(doc.letterhead).toEqual(['Sample Shop', 'Sample address', null]);
    expect(doc.summary).toEqual(['2 orders · 4 pieces · 3 line items', 'Categories: Polo 3 · Other 1', 'Short: 1 rows (1 pieces) — marked SHORT', 'Held and problem orders: 1, listed at the end, not counted', 'Every order still with us, all days']);
    expect(doc.rows.map((r) => [r.cells[0], r.cells[1], r.indent ?? 0, !!r.tick, r.mark ?? null])).toEqual([
      ['Polo', '3', 0, false, null],
      ['Ralph Lauren polo', '3', 1, false, null],
      ['Black', '3', 2, false, null],
      ['M', '2', 3, true, 'SHORT 1'],
      ['L', '1', 3, true, null],
      ['Other', '1', 0, false, null],
      ['Gift box', '1', 1, false, null],
      ['No colour', '1', 2, false, null],
      ['One size', '1', 3, true, null],
    ]);
    expect(doc.after).toEqual(['Held and problem orders (not counted above):', 'EX-1009 — on hold — 2 pcs']);
  });

  it('names the chosen days, leaves shortages out when the owner turns them off, and speaks Bengali', () => {
    const doc = pickingDocument(list({ range: { from: '2026-10-20', to: '2026-10-24' }, shortagesMarked: false, held: [], summary: { ...list().summary, held: 0 } }), { ...CFG, lang: 'bn' }, HEAD, 'Asia/Dhaka', AT);
    expect(doc.title).toBe('পিকিং লিস্ট');
    expect(doc.summary).toContain('2026-10-20 থেকে 2026-10-24 পর্যন্ত দেওয়া অর্ডার');
    expect(doc.summary).toContain('কম স্টক দেখানো বন্ধ');
    expect(doc.rows[0]!.cells[0]).toBe('পোলো');
    expect(doc.after).toEqual([]);
  });

  it('draws an A4 PDF', async () => {
    const read = readPdf(await pickingPdf(list(), CFG, HEAD, 'Asia/Dhaka', AT, boxText()));
    expect(read.xrefOk).toBe(true);
    expect(read.pages[0]!.mediaBox.map(Math.round)).toEqual([0, 0, 595, 842]);
  });
});
