// S24 · PR 462 (registry v292): the on-model-vs-flat-lay live pilot's own cohort — empty/off by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { photoshootPilotSettings, photoshootStyleAbTestSchema, PHOTOSHOOT_STYLE_AB_TEST_DEFAULT } from '../src/registry-photoshoot-pilot';

describe('photoshoot on-model-vs-flat-lay pilot setting (v292)', () => {
  it('is in the registry at version 302, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootPilotSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(302);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships with an empty cohort and a 50% split', () => {
    expect(photoshootPilotSettings['studio.photoshoot.styleAbTest'].default).toEqual(PHOTOSHOOT_STYLE_AB_TEST_DEFAULT);
    expect(PHOTOSHOOT_STYLE_AB_TEST_DEFAULT).toEqual({ productIds: [], splitPercent: 50 });
  });

  it('takes up to 50 real product ids and a 1–99% split, nothing else', () => {
    const uuid = '0190a1b2-0000-7000-8000-000000000001';
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [], splitPercent: 50 }).success).toBe(true);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [uuid], splitPercent: 1 }).success).toBe(true);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [uuid], splitPercent: 99 }).success).toBe(true);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [], splitPercent: 0 }).success).toBe(false);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [], splitPercent: 100 }).success).toBe(false);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: ['not-a-uuid'], splitPercent: 50 }).success).toBe(false);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: Array.from({ length: 51 }, () => uuid), splitPercent: 50 }).success).toBe(false);
    expect(photoshootStyleAbTestSchema.safeParse({ productIds: [], splitPercent: 50, extra: true }).success).toBe(false);
  });
});
