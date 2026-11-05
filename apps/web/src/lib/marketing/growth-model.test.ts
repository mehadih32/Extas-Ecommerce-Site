// S13 · PR 269 — the growth agent's proposals from the figures and the owner's limits: nothing while every limit is 0;
// pause for spend with no delivered order over the limit; lower / raise by the step; a tired creative against the days
// before; audiences from products and districts; never a paused campaign, an unknown spend or too few deliveries; the
// most urgent first, capped. Values made up.
import { describe, expect, it } from 'vitest';
import type { AdReturn, AdReturnRow } from '@extas/metrics';
import { adsGrowthSettings } from '@extas/settings';
import { flagged, growthProposals, stepped, type GrowthCampaign } from './growth-model';

const off = adsGrowthSettings['ads.growthAgent'].default;
const row = (key: string, x: Partial<AdReturnRow>): AdReturnRow => ({ key, platform: 'META', spendMinor: 100_000, delivered: 5, deliveredSalesMinor: 300_000, roasPercent: 300, ...x });
const ret = (x: Partial<AdReturn>): AdReturn => ({ from: '2026-10-01', to: '2026-10-07', campaigns: [], products: [], districts: [], total: row('total', {}), unshared: 0, ...x });
const camps = new Map<string, GrowthCampaign>([
  ['good', { id: 'good', paused: false, dailyBudgetMinor: 100_000 }],
  ['poor', { id: 'poor', paused: false, dailyBudgetMinor: 100_000 }],
  ['none', { id: 'none', paused: false, dailyBudgetMinor: 50_000 }],
  ['tired', { id: 'tired', paused: false, dailyBudgetMinor: null }],
  ['stopped', { id: 'stopped', paused: true, dailyBudgetMinor: 100_000 }],
  ['few', { id: 'few', paused: false, dailyBudgetMinor: 100_000 }],
  ['usd', { id: 'usd', paused: false, dailyBudgetMinor: 1_000 }],
]);
const now = ret({
  campaigns: [
    row('good', { roasPercent: 500 }),
    row('poor', { roasPercent: 120 }),
    row('none', { spendMinor: 80_000, delivered: 0, deliveredSalesMinor: 0, roasPercent: 0 }),
    row('tired', { roasPercent: 200 }),
    row('stopped', { roasPercent: 50, delivered: 0, deliveredSalesMinor: 0 }),
    row('few', { roasPercent: 900, delivered: 2 }),
    row('usd', { spendMinor: null, delivered: 0, roasPercent: null }),
  ],
  products: [row('p1', { roasPercent: 600 }), row('p2', { roasPercent: 600, delivered: 1 })],
  districts: [row('d1', { roasPercent: 450 }), row('', { roasPercent: 900 })],
});
const before = ret({ campaigns: [row('tired', { roasPercent: 400 }), row('good', { roasPercent: 520 })] });

describe('PR 269 · growth proposals', () => {
  it('makes nothing while every limit is 0 (as it ships), but still flags spend with no delivered order', () => {
    expect(growthProposals({ settings: off, now, before, campaigns: camps, scale: 100 })).toEqual([]);
    expect(flagged(now).map((r) => r.key)).toEqual(['none', 'stopped', 'usd']);
  });

  it('turns the owner’s limits into proposals, most urgent first, never for a paused campaign, an unknown spend or too few deliveries', () => {
    const settings = { ...off, goodRoasPercent: 400, poorRoasPercent: 150, noDeliveredSpend: 500, fatiguePercent: 30 };
    const p = growthProposals({ settings, now, before, campaigns: camps, scale: 100 });
    expect(p.map((x) => [x.type, x.refId])).toEqual([
      ['pause', 'none'],
      ['lowerBudget', 'poor'],
      ['refreshCreative', 'tired'],
      ['raiseBudget', 'good'],
      ['buildAudience', 'd1'],
      ['buildAudience', 'p1'],
    ]);
    expect(p[1]).toMatchObject({ fromDailyMinor: 100_000, toDailyMinor: 80_000 });
    expect(p[2]).toMatchObject({ roasPercent: 200, beforeRoasPercent: 400 });
    expect(p[3]).toMatchObject({ fromDailyMinor: 100_000, toDailyMinor: 120_000 });
    expect(p[4]!.refType).toBe('GeoArea');
    expect(p[5]!.refType).toBe('Product');
    // the spend limit is in whole taka: 80 000 paisa = 800 taka is not over 1 000
    expect(growthProposals({ settings: { ...settings, noDeliveredSpend: 1000 }, now, before, campaigns: camps, scale: 100 }).some((x) => x.type === 'pause')).toBe(false);
    expect(growthProposals({ settings: { ...settings, maxProposals: 2 }, now, before, campaigns: camps, scale: 100 })).toHaveLength(2);
  });

  it('steps a budget by the percent, never below one unit', () => {
    expect(stepped(100_000, 20, true)).toBe(120_000);
    expect(stepped(100_000, 20, false)).toBe(80_000);
    expect(stepped(1, 90, false)).toBe(1);
  });
});
