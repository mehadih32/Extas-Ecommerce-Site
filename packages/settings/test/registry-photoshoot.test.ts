// S24 · PR 447 (registry v292): the garment-prep/standardisation colour-drift tolerance — off (0) as it ships, so
// nothing is ever flagged until the owner sets a number (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { photoshootColourToleranceSchema, photoshootSettings, PHOTOSHOOT_COLOUR_TOLERANCE_DEFAULT } from '../src/registry-photoshoot';

describe('photoshoot garment-prep settings (v292)', () => {
  it('is in the registry at version 292, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(292);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships off: 0, which colourDrift treats as "never flag"', () => {
    expect(photoshootSettings['photoshoot.colourTolerance'].default).toBe(PHOTOSHOOT_COLOUR_TOLERANCE_DEFAULT);
    expect(PHOTOSHOOT_COLOUR_TOLERANCE_DEFAULT).toBe(0);
  });

  it('takes a whole number from 0 to 442 (the full sRGB range) only', () => {
    expect(photoshootColourToleranceSchema.safeParse(0).success).toBe(true);
    expect(photoshootColourToleranceSchema.safeParse(30).success).toBe(true);
    expect(photoshootColourToleranceSchema.safeParse(442).success).toBe(true);
    expect(photoshootColourToleranceSchema.safeParse(443).success).toBe(false);
    expect(photoshootColourToleranceSchema.safeParse(-1).success).toBe(false);
    expect(photoshootColourToleranceSchema.safeParse(1.5).success).toBe(false);
  });
});
