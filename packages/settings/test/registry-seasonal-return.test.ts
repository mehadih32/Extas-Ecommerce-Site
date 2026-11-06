// S12 · PR 530 (registry v251): the seasonal pages' yearly return — off as shipped, no dates (the owner's own), every
// number bounded, a date row checked, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { SEASONAL_RETURN_DEFAULT, seasonalReturnSchema, seasonalReturnSettings } from '../src/registry-seasonal-return';

describe('seasonal pages come back each year (v251)', () => {
  it('is in the registry at version 251, per store, labelled in English and Bengali, its default valid', () => {
    const s = seasonalReturnSettings['marketing.seasonalReturn'];
    expect(registry['marketing.seasonalReturn']).toBe(s);
    expect(s.version).toBe(251);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off with no dates: nothing comes back by itself', () => {
    expect(SEASONAL_RETURN_DEFAULT).toEqual({ on: false, leadDays: 14, afterDays: 2, dates: [] });
  });

  it('keeps every number inside its bounds, checks each date row and refuses unknown fields', () => {
    const ok = (patch: Record<string, unknown>) => seasonalReturnSchema.safeParse({ ...SEASONAL_RETURN_DEFAULT, ...patch }).success;
    const row = { occasion: 'eid', from: '2027-03-09', to: '2027-03-11', yearly: false };
    expect(ok({ on: true, dates: [row, { occasion: 'winter', from: '2026-12-01', to: '2027-02-15', yearly: true }] })).toBe(true);
    expect(ok({ leadDays: 91 })).toBe(false);
    expect(ok({ afterDays: -1 })).toBe(false);
    expect(ok({ dates: [{ ...row, to: '2027-03-08' }] })).toBe(false);
    expect(ok({ dates: [{ ...row, to: '2026-02-20', yearly: true }] })).toBe(true);
    expect(ok({ dates: [{ ...row, from: '2027-13-01' }] })).toBe(false);
    expect(ok({ dates: [{ ...row, occasion: 'Eid!' }] })).toBe(false);
    expect(ok({ publishAll: true })).toBe(false);
  });
});
