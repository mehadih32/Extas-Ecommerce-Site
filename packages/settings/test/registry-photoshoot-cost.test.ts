// S24 · PR 450 (registry v289): the photoshoot provider adapters' per-image rate — 0/not set by default, so the
// estimate shown before a batch runs is "unknown" rather than an invented number (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { photoshootCostSettings, photoshootRatesSchema, PHOTOSHOOT_RATES_DEFAULT } from '../src/registry-photoshoot-cost';

describe('photoshoot provider rates (v289)', () => {
  it('is in the registry at version 289, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootCostSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(289);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships with every rate at 0 — not set yet, never a guessed number', () => {
    expect(photoshootCostSettings['studio.photoshoot.rates'].default).toEqual(PHOTOSHOOT_RATES_DEFAULT);
    expect(PHOTOSHOOT_RATES_DEFAULT).toEqual({ fashn: { baseline: 0, premium: 0 }, fitroom: { baseline: 0, premium: 0 } });
  });

  it('takes only whole non-negative paisa for each provider and tier, and nothing extra', () => {
    expect(photoshootRatesSchema.safeParse(PHOTOSHOOT_RATES_DEFAULT).success).toBe(true);
    expect(photoshootRatesSchema.safeParse({ fashn: { baseline: 500, premium: 1200 }, fitroom: { baseline: 300, premium: 0 } }).success).toBe(true);
    expect(photoshootRatesSchema.safeParse({ fashn: { baseline: -1, premium: 0 }, fitroom: { baseline: 0, premium: 0 } }).success).toBe(false);
    expect(photoshootRatesSchema.safeParse({ fashn: { baseline: 1.5, premium: 0 }, fitroom: { baseline: 0, premium: 0 } }).success).toBe(false);
    expect(photoshootRatesSchema.safeParse({ fashn: { baseline: 0, premium: 0 }, fitroom: { baseline: 0, premium: 0 }, claid: { baseline: 0, premium: 0 } }).success).toBe(false);
  });
});
