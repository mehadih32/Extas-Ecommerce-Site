// S28 · PR 691 — Home Command: the figures of the profit, COD and ad-spend tiles and the pinned report cards, and who may read them.
import { describe, expect, it } from 'vitest';
import { DASH_PARTS, mayRead, pinTiles, salesPerUnit, type DashProfit } from './dashboard-data';
import type { ShellViewer } from '../admin-shell/sections';

const profit: DashProfit = {
  cur: { salesMinor: 200_000, netMinor: null, adsMinor: 50_000, orders: 10 },
  prev: { salesMinor: 100_000, netMinor: 5_000, adsMinor: 0, orders: 8 },
};

describe('PR 691 · Home Command tiles', () => {
  it('the new parts exist and need the right keys', () => {
    for (const p of ['profit', 'cod', 'pins'] as const) expect(DASH_PARTS).toContain(p);
    const books: ShellViewer = { perms: new Set(['books.read']), owner: false, hidden: new Set() };
    expect(mayRead('profit', books)).toBe(true);
    expect(mayRead('cod', books)).toBe(false);
    expect(mayRead('pins', books)).toBe(false);
    expect(mayRead('cod', { perms: new Set(['payments.view']), owner: false, hidden: new Set() })).toBe(true);
    expect(mayRead('pins', { perms: new Set(['reports.read']), owner: false, hidden: new Set() })).toBe(true);
  });
  it('sales per taka of ads is unknown without ad spend, never infinity', () => {
    expect(salesPerUnit(200_000, 50_000)).toBe(4);
    expect(salesPerUnit(200_000, 0)).toBeNull();
    expect(salesPerUnit(200_000, null)).toBeNull();
  });
  it('a pinned card shows its figure when the Home figures have it, the rest open the library', () => {
    const t = pinTiles(['sales', 'profit', 'orders', 'aov', 'restock', 'nonsense'], profit);
    expect(t).toEqual([
      { id: 'sales', kind: 'money', now: 200_000, prev: 100_000 },
      { id: 'profit', kind: 'money', now: null, prev: 5_000 },
      { id: 'orders', kind: 'count', now: 10, prev: 8 },
      { id: 'aov', kind: 'money', now: 20_000, prev: 12_500 },
      { id: 'restock', kind: 'link', now: null, prev: null },
    ]);
  });
  it('with no profit figures a pinned card is a link', () => {
    expect(pinTiles(['sales'], null)).toEqual([{ id: 'sales', kind: 'link', now: null, prev: null }]);
  });
});
