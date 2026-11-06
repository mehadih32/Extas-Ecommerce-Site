// PR 636 (CN-036) — Customers › All customers in the Lumen look: the four figures are summary tiles with the same
// numbers and notes as before; every tile but "People" opens the list on its view; "Returning" counts up as a share.
import { describe, expect, it } from 'vitest';
import type { CustomerList as ListData } from '@extas/customers';
import type { AdminView } from '@/lib/admin-page';
import { customerKpiTiles } from './CustomerList';

const view = { dict: {}, locale: 'en-GB', lang: 'en' } as unknown as AdminView;
const data = { counts: { all: 8, returning: 2, atrisk: 3, refused: 1 } } as unknown as ListData;

describe('customer list summary tiles', () => {
  it('keeps the four figures, in order, with their numbers', () => {
    const tiles = customerKpiTiles(view, data, { returningMinOrders: 2, atRiskDays: 60 });
    expect(tiles.map((x) => x.key)).toEqual(['people', 'returning', 'atrisk', 'refused']);
    expect(tiles.map((x) => x.shown)).toEqual(['8', '25%', '3', '1']);
    expect(tiles[1]!.value).toBeCloseTo(0.25);
    expect(tiles[1]!.format.kind).toBe('percent');
  });

  it('links every tile but People to its view, keeping the segment', () => {
    const tiles = customerKpiTiles(view, data, { returningMinOrders: 2, atRiskDays: 60 }, 'seg-1');
    expect(tiles[0]!.href).toBeUndefined();
    for (const tl of tiles.slice(1)) {
      expect(tl.href).toContain(`view=${tl.key}`);
      expect(tl.href).toContain('seg-1');
    }
  });

  it('shows the empty mark for Returning when nobody is counted yet', () => {
    const tiles = customerKpiTiles(view, { counts: {} } as unknown as ListData, { returningMinOrders: 2, atRiskDays: 60 });
    expect(tiles[1]!.value).toBe(0);
    expect(tiles[0]!.shown).toBe('0');
  });
});
