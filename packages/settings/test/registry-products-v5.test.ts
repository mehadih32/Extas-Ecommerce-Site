// S28 · PR 680-685 (registry v306): the product screens' settings are off as shipped and labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { mediaQualitySchema, productsV5Settings } from '../src/registry-products-v5';

describe('products v5 settings (v306)', () => {
  it('every key is in the registry, at 306, never owner data, labelled in English and Bengali', () => {
    for (const [key, spec] of Object.entries(productsV5Settings)) {
      expect((registry as Record<string, unknown>)[key]).toBe(spec);
      expect(spec.version).toBe(306);
      expect(spec.isOwnerData).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
      }
    }
  });
  it('media.quality is off as shipped and refuses nonsense numbers', () => {
    const d = productsV5Settings['media.quality'].default;
    expect(d.on).toBe(false);
    expect(mediaQualitySchema.safeParse(d).success).toBe(true);
    for (const b of [{ minSide: 5 }, { sharpnessMin: 0 }, { ratioTolerancePct: 90 }, { extra: 1 }]) expect(mediaQualitySchema.safeParse({ ...d, ...b }).success).toBe(false);
  });
});
