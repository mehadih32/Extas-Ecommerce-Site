// PR 829 (prototype v5): the figures above the combo lists.
import { describe, expect, it } from 'vitest';
import { summaryOf } from './summary-model';

const c = (state: string, offer = true, savingPercent = 10) => ({ state, pricing: { offer, savingPercent } });
const report = { totals: { setsOrdered: 12, salesMinor: 540000 }, top: [{ nameEn: 'None', nameBn: null, setsOrdered: 0 }, { nameEn: 'Polo + Chino', nameBn: null, setsOrdered: 7 }] };

describe('combo summary', () => {
  it('counts the combos on sale and the live rules, and the ones waiting for their start day', () => {
    const s = summaryOf([c('live'), c('live'), c('soon'), c('off'), c('ended')], report, 3);
    expect(s.onShop).toBe(5);
    expect(s.waiting).toBe(1);
  });
  it('takes the sold sets and the sales from the report, and names the first row with a set sold as the best', () => {
    const s = summaryOf([], report, 0);
    expect(s.sold).toBe(12);
    expect(s.salesMinor).toBe(540000);
    expect(s.best).toEqual({ nameEn: 'Polo + Chino', nameBn: null, sets: 7 });
    expect(summaryOf([], { totals: { setsOrdered: 0, salesMinor: 0 }, top: [] }, 0).best).toBeNull();
  });
  it('averages the saving over the on-sale combos with an offer, rounded down, and is 0 without any', () => {
    expect(summaryOf([c('live', true, 10), c('live', true, 15), c('live', false, 0), c('off', true, 50)], report, 0).avgSavingPercent).toBe(12);
    expect(summaryOf([c('live', false, 0)], report, 0).avgSavingPercent).toBe(0);
  });
});
