// PR 799 — the library's question cards: the prototype's eight groups, the movement against the span before, and what is not known.
import { describe, expect, it } from 'vitest';
import { CARD_IDS, libraryGroups, type LibInput } from './library';

const span = { orders: 10, pieces: 25, orderValue: 100_000, aov: 10_000, netProfit: 20_000, margin: 20 };
const base: LibInput = {
  cur: span,
  prev: { ...span, orderValue: 80_000, netProfit: null },
  bestChannel: { key: 'source:WEBSITE', profit: 9000, was: 6000 },
  restock: 3,
  unsold: 2,
  top: { name: 'Polo', qty: 12, valueMinor: 24_000, was: 10 },
  repeat: 31.4,
  newCust: { now: 8, was: 4 },
  returns: { rate: 12, was: 10, n: 3 },
  reason: { code: 'SIZE_TOO_SMALL', n: 2 },
  roas: 3.2,
  roasWas: null,
  adSpend: 5000,
  adSpendWas: 4000,
  topArea: { name: 'Dhaka', valueMinor: 70_000, share: 70 },
  badArea: { name: 'Sylhet', rate: 40, n: 5 },
  confirmH: 1.5,
  confirmHWas: 2,
  courier: { name: 'Pathao', success: 91.2, n: 50 },
  incomplete: 4,
};

describe('library cards', () => {
  const g = libraryGroups(base);
  const all = g.flatMap((x) => x.cards);
  const by = (id: string) => all.find((c) => c.id === id)!;
  it('has the prototype groups in order and every card once', () => {
    expect(g.map((x) => x.id)).toEqual(['sales', 'products', 'customers', 'delivery', 'marketing', 'areas', 'team']);
    expect(all.map((c) => c.id).sort()).toEqual([...CARD_IDS].sort());
  });
  it('tells the movement against the span before, and null when it cannot be told', () => {
    expect(by('sales').change).toBeCloseTo(0.25, 5);
    expect(by('profit').change).toBeNull();
    expect(by('roas').change).toBeNull();
    expect(by('returns').lowerBetter).toBe(true);
    expect(by('best').change).toBeCloseTo(0.2, 5);
  });
  it('shows "not known" instead of a made-up number', () => {
    const x = libraryGroups({ ...base, cur: { ...span, netProfit: null, margin: null }, restock: null, roas: null, courier: null, topArea: null }).flatMap((c) => c.cards);
    expect(x.find((c) => c.id === 'profit')!.val).toEqual({ k: 'none' });
    expect(x.find((c) => c.id === 'restock')!.val).toEqual({ k: 'none' });
    expect(x.find((c) => c.id === 'roas')!.val).toEqual({ k: 'none' });
    expect(x.find((c) => c.id === 'courierrep')!.sub).toBeNull();
  });
  it('opens the report each question belongs to', () => {
    expect(by('courierrep').href).toBe('/admin/reports/couriers');
    expect(by('checkoutj').href).toBe('/admin/orders/incomplete');
  });
});
