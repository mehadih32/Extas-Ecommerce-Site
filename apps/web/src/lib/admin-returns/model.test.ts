import { describe, expect, it } from 'vitest';
import type { ExchangeView } from '@extas/orders';
import bn from '../../../messages/admin-returns.bn.json';
import en from '../../../messages/admin-returns.en.json';
import { boardOf, DONE_ON_BOARD, reasonTone, returnsHref, sizeChips, statusTone, windowLine } from './model';

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

// qa-gate I7 (PR 614): on ERP contract v6 the case card says how many of the exchange window's hours are left, in the
// staff's own words (en and bn), by the same rule the approval uses (packages/orders exchange-v6.db.test.ts).
describe('the exchange window on the v6 case card (qa-gate I7)', () => {
  const at = '2026-11-01T04:00:00.000Z';
  it('picks the words for each state: hours left of the window, closed, or not started', () => {
    expect(windowLine({ state: 'OPEN', windowHours: 72, hoursLeft: 42, endsAt: at, deliveredAt: null })).toEqual({ key: 'erpx.windowLeft', vars: { n: 42, total: 72 }, endsAt: at, tone: 'ok' });
    expect(windowLine({ state: 'CLOSED', windowHours: 72, hoursLeft: 0, endsAt: at, deliveredAt: null })).toEqual({ key: 'erpx.windowClosed', vars: { total: 72 }, endsAt: at, tone: 'bad' });
    expect(windowLine({ state: 'UNKNOWN', windowHours: 72, hoursLeft: null, endsAt: null, deliveredAt: null })).toEqual({ key: 'erpx.windowUnknown', vars: { total: 72 }, endsAt: null, tone: 'warn' });
  });

  it('both languages carry the words with the same blanks, and the practice-ERP refusal names practice mode', () => {
    const erpx = (x: unknown) => (x as { erpx: Record<string, string> }).erpx;
    const errs = (x: unknown) => (x as { errors: Record<string, string> }).errors;
    const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of ['window', 'windowLeft', 'windowClosed', 'windowUnknown']) {
      expect(erpx(en)[k], k).toBeTruthy();
      expect(blanks(erpx(bn)[k]!), k).toEqual(blanks(erpx(en)[k]!));
    }
    expect(blanks(erpx(en).windowLeft!)).toEqual(['at', 'n', 'total']);
    expect(errs(en).ERP_ON_PRACTICE).toMatch(/practice/i);
    expect(errs(bn).ERP_ON_PRACTICE).toMatch(/প্র্যাকটিস/);
    expect(errs(en).ERP_ON_PRACTICE).not.toBe(errs(en).ERP_UNAVAILABLE);
  });
});
