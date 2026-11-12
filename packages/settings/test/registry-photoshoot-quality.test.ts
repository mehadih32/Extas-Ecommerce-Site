// S24 · PR 453 (registry v291): the best-of-2 quality cut-off — never auto-rejects (0) by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { photoshootQualityThresholdSchema, photoshootQualitySettings, PHOTOSHOOT_QUALITY_THRESHOLD_DEFAULT } from '../src/registry-photoshoot-quality';

describe('photoshoot quality cut-off setting (v291)', () => {
  it('is in the registry at version 291, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootQualitySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(291);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships at 0 — never auto-rejects', () => {
    expect(photoshootQualitySettings['studio.photoshoot.qualityThresholdPercent'].default).toBe(PHOTOSHOOT_QUALITY_THRESHOLD_DEFAULT);
    expect(PHOTOSHOOT_QUALITY_THRESHOLD_DEFAULT).toBe(0);
  });

  it('takes a whole percent, 0 to 100, only', () => {
    expect(photoshootQualityThresholdSchema.safeParse(0).success).toBe(true);
    expect(photoshootQualityThresholdSchema.safeParse(70).success).toBe(true);
    expect(photoshootQualityThresholdSchema.safeParse(100).success).toBe(true);
    expect(photoshootQualityThresholdSchema.safeParse(101).success).toBe(false);
    expect(photoshootQualityThresholdSchema.safeParse(-1).success).toBe(false);
    expect(photoshootQualityThresholdSchema.safeParse(1.5).success).toBe(false);
  });
});
