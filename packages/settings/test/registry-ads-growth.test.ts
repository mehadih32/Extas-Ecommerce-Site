// S13 · PR 269 (registry v175): the AI growth agent's limits — at version 175, never owner data, labelled in both
// languages, off as it ships with every proposal kind off (limits 0), every value bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsGrowthAgentSchema, adsGrowthSettings, GROWTH_DAYS_MAX, GROWTH_ROAS_MAX } from '../src/registry-ads-growth';

describe('ads.growthAgent (v175)', () => {
  it('is in the registry at version 175, store-level, labelled in English and Bengali', () => {
    const spec = adsGrowthSettings['ads.growthAgent'];
    expect(registry['ads.growthAgent']).toBe(spec);
    expect(spec.version).toBe(175);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off with no proposal kind on, and refuses what is out of range', () => {
    const d = adsGrowthSettings['ads.growthAgent'].default;
    expect(d.on).toBe(false);
    expect([d.goodRoasPercent, d.poorRoasPercent, d.noDeliveredSpend, d.fatiguePercent]).toEqual([0, 0, 0, 0]);
    expect(adsGrowthAgentSchema.safeParse(d).success).toBe(true);
    for (const bad of [{ days: 0 }, { days: GROWTH_DAYS_MAX + 1 }, { goodRoasPercent: GROWTH_ROAS_MAX + 1 }, { stepPercent: 0 }, { stepPercent: 91 }, { fatiguePercent: 101 }, { noDeliveredSpend: -1 }, { approvalHours: 0 }, { maxProposals: 1.5 }, { extra: 1 }])
      expect(adsGrowthAgentSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
