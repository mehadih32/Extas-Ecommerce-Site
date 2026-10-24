import { describe, expect, it } from 'vitest';
import type { ExchangeView } from '@extas/orders';
import { boardOf, DONE_ON_BOARD, reasonTone, returnsHref, sizeChips, statusTone } from './model';

const ex = (id: string, status: string): ExchangeView => ({ id, status }) as ExchangeView;

describe('the returns board', () => {
  it('puts each exchange in its column, newest first, and keeps only the newest finished ones', () => {
    const rows = [ex('a', 'REQUESTED'), ex('b', 'APPROVED'), ex('c', 'PICKUP_BOOKED'), ex('d', 'RECEIVED'), ex('e', 'QC_FAILED'), ex('f', 'REJECTED'), ...Array.from({ length: DONE_ON_BOARD + 3 }, (_, i) => ex(`done${i}`, 'COMPLETED'))];
    const b = boardOf(rows);
    expect(b.requested.map((r) => r.id)).toEqual(['a']);
    expect(b.approved.map((r) => r.id)).toEqual(['b', 'c']);
    expect(b.qc.map((r) => r.id)).toEqual(['d', 'e']);
    expect(b.done).toHaveLength(DONE_ON_BOARD);
    expect(b.done[0]!.id).toBe('f');
  });

  it('gives the pills their tones and builds the page address', () => {
    expect(reasonTone('size')).toBe('info');
    expect(reasonTone('wrong')).toBe('bad');
    expect(statusTone('REQUESTED')).toBe('warn');
    expect(statusTone('COMPLETED')).toBe('ok');
    expect(returnsHref()).toBe('/admin/orders/returns');
    expect(returnsHref({ case: 'x', order: '', line: null })).toBe('/admin/orders/returns?case=x');
  });
});

describe('the size switcher (PR 188)', () => {
  const z = (variantId: string, o: Partial<{ sizeLabel: string | null; sellable: number; samePrice: boolean; current: boolean }> = {}) => ({ variantId, sku: `SKU-${variantId}`, sizeKey: variantId, sizeLabel: variantId.toUpperCase(), sellable: 3, priceMinor: 100, samePrice: true, current: false, ...o });
  const words = { price: 'other price', out: 'none free' };
  it('says what stops each other size: another price always, none free only before approval', () => {
    const s = { exchangeItemId: 'i', newVariantId: 'm', sizes: [z('s', { samePrice: false }), z('m', { current: true }), z('l', { sellable: 0 }), z('xl', { sizeLabel: null })] };
    expect(sizeChips(s, true, words)).toEqual([
      { variantId: 's', label: 'S', current: false, why: 'other price' },
      { variantId: 'm', label: 'M', current: true, why: null },
      { variantId: 'l', label: 'L', current: false, why: 'none free' },
      { variantId: 'xl', label: 'SKU-xl', current: false, why: null },
    ]);
    expect(sizeChips(s, false, words).map((c) => c.why)).toEqual(['other price', null, null, null]);
  });
});
