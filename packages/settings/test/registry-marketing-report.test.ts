// S13 · PR 283 (registry v218): the marketing report — at version 218, off as it ships, never owner data, labelled in
// both languages; its period and result window inside their guards.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { marketingReportSettings, marketingReportSettingsSchema, REPORT_MAX_DAYS_MAX, REPORT_MAX_DAYS_MIN, REPORT_RESULT_DAYS_MAX, REPORT_RESULT_DAYS_MIN } from '../src/registry-marketing-report';

describe('marketing.report (v218)', () => {
  it('is in the registry at version 218, store-level, off, labelled in English and Bengali', () => {
    const spec = marketingReportSettings['marketing.report'];
    expect(registry['marketing.report']).toBe(spec);
    expect(spec.version).toBe(218);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, maxDays: 366, resultDays: 7 });
    expect(marketingReportSettingsSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('takes whole days inside the guards and refuses the rest', () => {
    const ok = { enabled: true, maxDays: 90, resultDays: 7 };
    for (const v of [ok, { ...ok, maxDays: REPORT_MAX_DAYS_MIN }, { ...ok, maxDays: REPORT_MAX_DAYS_MAX }, { ...ok, resultDays: REPORT_RESULT_DAYS_MIN }, { ...ok, resultDays: REPORT_RESULT_DAYS_MAX }]) {
      expect(marketingReportSettingsSchema.safeParse(v).success, JSON.stringify(v)).toBe(true);
    }
    for (const bad of [{ ...ok, maxDays: REPORT_MAX_DAYS_MIN - 1 }, { ...ok, maxDays: REPORT_MAX_DAYS_MAX + 1 }, { ...ok, resultDays: 0 }, { ...ok, resultDays: REPORT_RESULT_DAYS_MAX + 1 }, { ...ok, resultDays: 2.5 }, { enabled: true, maxDays: 90 }, { ...ok, extra: 1 }]) {
      expect(marketingReportSettingsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
