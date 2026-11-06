// S13 · PR 280 (registry v215): seasonal home-page switching — at version 215, off as it ships, never owner data,
// labelled in both languages; only the switch, nothing else.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { seasonalHomeSettings, seasonalHomeSettingsSchema } from '../src/registry-seasonal-home';

describe('marketing.seasonalHome (v215)', () => {
  it('is in the registry at version 215, store-level, off, labelled in English and Bengali', () => {
    const spec = seasonalHomeSettings['marketing.seasonalHome'];
    expect(registry['marketing.seasonalHome']).toBe(spec);
    expect(spec.version).toBe(215);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false });
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('refuses a non-boolean switch and extra keys', () => {
    for (const b of [{ enabled: 'yes' }, { enabled: true, maxLooks: 3 }, {}]) expect(seasonalHomeSettingsSchema.safeParse(b).success).toBe(false);
    expect(seasonalHomeSettingsSchema.safeParse({ enabled: true }).success).toBe(true);
  });
});
