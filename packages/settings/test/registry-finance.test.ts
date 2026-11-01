// S16 · CN-031 lane B (registry v160–169): the finance, costs & reports settings — every key in the registry inside lane
// B's versions, labelled in both languages, its default valid; PR 347's costs report limits refuse day rows above the period.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { costReportSchema, financeSettings } from '../src/registry-finance';

describe('finance settings (v160–169)', () => {
  it('every key is in the registry at a version 160–169, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(financeSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBeGreaterThanOrEqual(160);
      expect(s.version, key).toBeLessThanOrEqual(169);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 347: costs.report — day rows never more than the period, both within their bounds', () => {
    expect(costReportSchema.safeParse({ maxDays: 100, maxDayRows: 92 }).success).toBe(true);
    expect(costReportSchema.safeParse({ maxDays: 60, maxDayRows: 92 }).success).toBe(false);
    expect(costReportSchema.safeParse({ maxDays: 10, maxDayRows: 7 }).success).toBe(false);
    expect(costReportSchema.safeParse({ maxDays: 400, maxDayRows: 92, extra: 1 }).success).toBe(false);
  });
});
