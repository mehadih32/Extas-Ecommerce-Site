// S13 · PR 282 (registry v217): the marketing calendar — at version 217, off as it ships, never owner data, labelled in
// both languages; the view's days inside their guard.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { CALENDAR_DAYS_MAX, CALENDAR_DAYS_MIN, marketingCalendarSettings, marketingCalendarSettingsSchema } from '../src/registry-marketing-calendar';

describe('marketing.calendar (v217)', () => {
  it('is in the registry at version 217, store-level, off, labelled in English and Bengali', () => {
    const spec = marketingCalendarSettings['marketing.calendar'];
    expect(registry['marketing.calendar']).toBe(spec);
    expect(spec.version).toBe(217);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, days: 60 });
    expect(marketingCalendarSettingsSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('takes any whole number of days inside the guard and refuses the rest', () => {
    for (const days of [CALENDAR_DAYS_MIN, 30, CALENDAR_DAYS_MAX]) expect(marketingCalendarSettingsSchema.safeParse({ enabled: true, days }).success).toBe(true);
    for (const bad of [{ enabled: true, days: CALENDAR_DAYS_MIN - 1 }, { enabled: true, days: CALENDAR_DAYS_MAX + 1 }, { enabled: true, days: 10.5 }, { enabled: true }, { enabled: true, days: 30, extra: 1 }]) {
      expect(marketingCalendarSettingsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
