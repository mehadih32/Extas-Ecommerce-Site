// PR 636 (CN-036), PR 801 — Customers › All customers in the Lumen look: the four figures of the prototype (Customers,
// New this month, Repeat customers, Average spend) are summary tiles; "Repeat customers" opens the list on its view and
// counts up as a share; the Group column says VIP, At risk, Repeat or New as the prototype does.
import { describe, expect, it } from 'vitest';
import type { CustomerList as ListData } from '@extas/customers';
import type { AdminView } from '@/lib/admin-page';
import { customerKpiTiles, groupOf } from './CustomerList';

const view = { dict: {}, locale: 'en-GB', lang: 'en' } as unknown as AdminView;
const data = { counts: { all: 8, returning: 2, atrisk: 3, refused: 1 }, extra: { newThisMonth: 3, newLastMonth: 2, avgSalesMinor: 250_000, top10Pct: 61 } } as unknown as ListData;
const settings = { returningMinOrders: 2, atRiskDays: 60 };

describe('customer list summary tiles', () => {
  it('shows the four figures of the prototype, in order, with their numbers', () => {
    const tiles = customerKpiTiles(view, data, settings);
    expect(tiles.map((x) => x.key)).toEqual(['people', 'newmonth', 'returning', 'avg']);
    expect(tiles.map((x) => x.shown)).toEqual(['8', '3', '25%', '250,000']);
    expect(tiles[2]!.value).toBeCloseTo(0.25);
    expect(tiles[2]!.format.kind).toBe('percent');
  });

  it('compares New this month with the same days last month', () => {
    const tiles = customerKpiTiles(view, data, settings);
    expect(tiles[1]!.delta).toBeCloseTo(0.5);
    const none = customerKpiTiles(view, { counts: {}, extra: { newThisMonth: 1, newLastMonth: 0, avgSalesMinor: 0, top10Pct: 0 } } as unknown as ListData, settings);
    expect(none[1]!.delta).toBeNull();
  });

  it('links Repeat customers to its view, keeping the segment, and no other tile', () => {
    const tiles = customerKpiTiles(view, data, settings, 'seg-1');
    expect(tiles[2]!.href).toContain('view=returning');
    expect(tiles[2]!.href).toContain('seg-1');
    expect(tiles.filter((x) => x.href).length).toBe(1);
  });

  it('shows the empty mark for Repeat customers when nobody is counted yet', () => {
    const tiles = customerKpiTiles(view, { counts: {} } as unknown as ListData, settings);
    expect(tiles[2]!.value).toBe(0);
    expect(tiles[0]!.shown).toBe('0');
  });
});

describe('customer group pill', () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  const day = 86_400_000;
  const row = (o: Partial<{ orders: number; salesMinor: number; delivered: number; lastOrderAt: Date | null }>) => ({ orders: 1, salesMinor: 0, delivered: 1, lastOrderAt: new Date(now - day), ...o });
  it('VIP first, then At risk, Repeat and New', () => {
    expect(groupOf(row({ salesMinor: 900_000 }), { ...settings, vipMinSalesMinor: 800_000 }, now)).toBe('vip');
    expect(groupOf(row({ orders: 3, lastOrderAt: new Date(now - 70 * day) }), settings, now)).toBe('risk');
    expect(groupOf(row({ orders: 3 }), settings, now)).toBe('repeat');
    expect(groupOf(row({ orders: 1 }), settings, now)).toBe('new');
  });
  it('no VIP while the owner has no figure', () => {
    expect(groupOf(row({ salesMinor: 9_000_000 }), settings, now)).toBe('new');
  });
});
