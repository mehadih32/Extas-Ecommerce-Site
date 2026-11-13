// S28 · PR 665 — the order page's part of Merge: the body the dialog sends, the two buttons, the address question and the timeline words.
import { describe, expect, it } from 'vitest';
import type { MergeView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { mergeBody, mergeEventLine, mergeSpecs } from './merge';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ORDER = { id: '0190a0b0-0000-7000-8000-000000000001', number: 'EX-1001', currency: 'BDT' };
const mate = (n: string, sameAddress: boolean, blocked: string | null) => ({
  orderId: `0190a0b0-0000-7000-8000-00000000000${n}`,
  number: `EX-100${n}`,
  status: 'PLACED',
  placedAt: new Date('2026-11-01T05:00:00Z'),
  totalMinor: 180_000,
  sameAddress,
  address: 'x',
  blocked,
  lines: [{ lineId: `0190a0b0-0000-7000-8000-0000000001${n}`, sku: 'S', name: 'Polo', colour: 'Sky', size: 'M', quantity: 1, lineTotalMinor: 90_000, movable: true }],
});
const MV = (mates: ReturnType<typeof mate>[], over: Partial<MergeView> = {}): MergeView =>
  ({ enabled: true, canMerge: true, closed: null, lookBackDays: 5, differentAddress: 'ask', main: { orderId: ORDER.id, number: ORDER.number, address: 'x', totalMinor: 1, lines: [] }, mates, ...over }) as unknown as MergeView;

describe('mergeBody', () => {
  it('keeps the page\'s order as the kept one, turns yes into true and one leave-out list into one field', () => {
    expect(mergeBody(ORDER.id, { orders: ['a', 'b'], leaveOut: ['l1'], confirmAddress: 'yes', call: 'yes', note: ' hi ' })).toEqual({
      mainOrderId: ORDER.id,
      sources: [{ orderId: 'a' }, { orderId: 'b' }],
      leaveOutLineIds: ['l1'],
      confirmAddress: true,
      call: true,
      note: 'hi',
    });
    expect(mergeBody(ORDER.id, { orders: ['a'], confirmAddress: '' })).toEqual({ mainOrderId: ORDER.id, sources: [{ orderId: 'a' }] });
  });
});

describe('mergeSpecs', () => {
  it('gives Merge and Merge + call only when the person may, the switch is on and an order can be folded in', () => {
    expect(mergeSpecs(view('en'), ORDER, MV([mate('2', true, null)])).map((s) => s.id)).toEqual(['merge', 'mergeCall']);
    expect(mergeSpecs(view('en'), ORDER, MV([mate('2', true, null)], { canMerge: false }))).toEqual([]);
    expect(mergeSpecs(view('en'), ORDER, MV([mate('2', true, 'HAS_PAYMENT')]))).toEqual([]);
  });
  it('lists only the orders that can be folded in; "Merge + call" fixes the call', () => {
    const [a, b] = mergeSpecs(view('en'), ORDER, MV([mate('2', true, null), mate('3', true, 'TOO_OLD')]));
    expect(a?.fields.find((f) => f.name === 'orders')?.options).toHaveLength(1);
    expect(a?.fields.find((f) => f.name === 'leaveOut')?.options).toHaveLength(1);
    expect(b?.fixed).toEqual({ call: 'yes' });
    expect(a?.version).toBeNull();
  });
  it('asks about the address only when one differs and the setting says ask', () => {
    const has = (m: MergeView) => !!mergeSpecs(view('en'), ORDER, m)[0]?.fields.some((f) => f.name === 'confirmAddress');
    expect(has(MV([mate('2', true, null)]))).toBe(false);
    expect(has(MV([mate('2', false, null)]))).toBe(true);
    expect(has(MV([mate('2', false, null)], { differentAddress: 'refuse' }))).toBe(false);
  });
  it('both languages build', () => {
    for (const l of ['en', 'bn'] as const) expect(mergeSpecs(view(l), ORDER, MV([mate('2', true, null)]))[0]?.label).toBeTruthy();
  });
});

describe('mergeEventLine', () => {
  it('words both events and nothing else', () => {
    expect(mergeEventLine(view('en'), 'order.mergedInto', { mainNumber: 'EX-1001', movedLines: 2, movedMinor: 180_000 }, 'BDT')).toContain('EX-1001');
    expect(mergeEventLine(view('en'), 'order.mergedFrom', { folded: [{ number: 'EX-1002', movedLines: 2, movedMinor: 180_000 }] }, 'BDT')).toContain('EX-1002');
    expect(mergeEventLine(view('en'), 'order.note', {}, 'BDT')).toBeNull();
  });
});
