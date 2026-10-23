// S02 · the house motion (PR 86, 87): every key at version 31, public, never owner data, the sweeps as designed and the
// celebration off.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { motionSettings, SHOP_SWEEPS, shopSweepSchema, thanksCelebrateSchema } from '../src/registry-motion';

describe('house motion settings (v31)', () => {
  it('every key is in the registry at version 31, public, never owner data', () => {
    for (const [key, spec] of Object.entries(motionSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(31);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
    }
  });

  it('PR 87: the celebration is off, at most 2.5 seconds, its words in both languages', () => {
    const d = motionSettings['thanks.celebrate'].default;
    expect(d.on).toBe(false);
    expect(thanksCelebrateSchema.safeParse({ ...d, durationMs: 2501 }).success).toBe(false);
    expect(thanksCelebrateSchema.safeParse({ ...d, text: { en: 'Eid Mubarak!', bn: '' } }).success).toBe(false);
    expect(thanksCelebrateSchema.safeParse({ ...d, campaign: 'Eid 2026' }).success).toBe(false);
    expect(thanksCelebrateSchema.safeParse({ ...d, campaign: 'eid-2026', from: '2026-11-01', until: '2026-11-03' }).success).toBe(true);
  });

  it('PR 86: every sweep on as designed but Add to Bag, one switch each, nothing unknown', () => {
    const d = motionSettings['shop.sweep'].default;
    expect(d.on).toBe(true);
    expect(Object.keys(d.items)).toEqual([...SHOP_SWEEPS]);
    expect(d.items.addToBag).toBe(false);
    expect(shopSweepSchema.safeParse({ ...d, items: { ...d.items, sparkle: true } }).success).toBe(false);
    const { logo: _gone, ...short } = d.items;
    expect(shopSweepSchema.safeParse({ ...d, items: short }).success).toBe(false);
  });
});
