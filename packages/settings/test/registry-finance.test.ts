// S16 · CN-031 lane B (registry v160–169): the finance, costs & reports settings — every key in the registry inside lane
// B's versions, labelled in both languages, its default valid; PR 347's costs report limits refuse day rows above the period.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { costReportSchema, financeSettings, moneyReportSchema, teamBadgesSchema, vatRatesSchema } from '../src/registry-finance';

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

  it('PR 350: the VAT system is off as shipped; the rates are owner data, empty, each target once, 0–50 %', () => {
    expect(financeSettings['vat.system'].default).toEqual({ enabled: false, onDelivery: false });
    expect(financeSettings['vat.rates'].default).toBeNull();
    expect(financeSettings['vat.rates'].isOwnerData).toBe(true);
    const cat = '0190a1b2-0000-7000-8000-000000000001';
    const prod = '0190a1b2-0000-7000-8000-000000000002';
    expect(vatRatesSchema.safeParse({ defaultBps: 1500, categories: [{ categoryId: cat, bps: 0 }], products: [{ productId: prod, bps: 750 }] }).success).toBe(true);
    expect(vatRatesSchema.safeParse({ defaultBps: null, categories: [], products: [] }).success).toBe(true);
    expect(vatRatesSchema.safeParse({ defaultBps: 5001, categories: [], products: [] }).success).toBe(false);
    expect(vatRatesSchema.safeParse({ defaultBps: 1500.5, categories: [], products: [] }).success).toBe(false);
    expect(vatRatesSchema.safeParse({ defaultBps: null, categories: [{ categoryId: cat, bps: 500 }, { categoryId: cat, bps: 750 }], products: [] }).success).toBe(false);
    expect(vatRatesSchema.safeParse({ defaultBps: null, categories: [], products: [{ productId: prod, bps: 1 }, { productId: prod, bps: 2 }] }).success).toBe(false);
  });

  it('PR 351: the money report is off as shipped at 22:00; a time is HH:MM, a month day 1–28', () => {
    const d = financeSettings['money.report'].default;
    expect(d).toMatchObject({ enabled: false, frequency: 'daily', at: '22:00' });
    expect(moneyReportSchema.safeParse({ ...d, at: '24:00' }).success).toBe(false);
    expect(moneyReportSchema.safeParse({ ...d, at: '9:30' }).success).toBe(false);
    expect(moneyReportSchema.safeParse({ ...d, monthDay: 31 }).success).toBe(false);
    expect(moneyReportSchema.safeParse({ ...d, weekday: 7 }).success).toBe(false);
    expect(moneyReportSchema.safeParse({ ...d, frequency: 'hourly' }).success).toBe(false);
    expect(moneyReportSchema.safeParse({ ...d, at: '06:05', frequency: 'monthly', monthDay: 28 }).success).toBe(true);
  });

  it('PR 352: team badges are off as shipped with no minimum set; a minimum is a whole number from 1', () => {
    const d = financeSettings['team.badges'].default;
    expect(d.enabled).toBe(false);
    expect(Object.values(d.mins).every((m) => m === null)).toBe(true);
    expect(teamBadgesSchema.safeParse({ ...d, mins: { ...d.mins, confirmed: 0 } }).success).toBe(false);
    expect(teamBadgesSchema.safeParse({ ...d, mins: { ...d.mins, replies: 40 } }).success).toBe(true);
    expect(teamBadgesSchema.safeParse({ ...d, period: 'day' }).success).toBe(false);
  });
});
