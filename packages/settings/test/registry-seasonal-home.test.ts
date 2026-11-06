// S13 · PR 280 (registry v215): seasonal home-page switching — at version 215, off as it ships, never owner data,
// labelled in both languages; only the switch, nothing else.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { seasonalHomeNotesSchema, seasonalHomeSettings, seasonalHomeSettingsSchema } from '../src/registry-seasonal-home';

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

  it('follow-up 650: the bell notes at version 249, off with a week, days 1–60 only', () => {
    const spec = seasonalHomeSettings['marketing.seasonalHome.notes'];
    expect(registry['marketing.seasonalHome.notes']).toBe(spec);
    expect(spec.version).toBe(249);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, days: 7 });
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
    for (const b of [{ enabled: true, days: 0 }, { enabled: true, days: 61 }, { enabled: true, days: 2.5 }, { enabled: 'yes', days: 7 }, { enabled: true }, { enabled: true, days: 7, extra: 1 }]) expect(seasonalHomeNotesSchema.safeParse(b).success).toBe(false);
    expect(seasonalHomeNotesSchema.safeParse({ enabled: true, days: 60 }).success).toBe(true);
  });
});
