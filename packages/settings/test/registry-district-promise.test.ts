// SIM-F-048 · PR 550 follow-up (registry v97): the delivery promise per district — at version 97, never owner data,
// labelled in both languages, off with no rows as shipped; a row's shortest time is never above its longest and a
// district has one row.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { districtPromiseSchema, districtPromiseSettings } from '../src/registry-district-promise';

const spec = districtPromiseSettings['delivery.promise.districts'];

describe('delivery promise per district setting (v97)', () => {
  it('is in the registry at version 97, store-level, labelled in English and Bengali', () => {
    expect(registry['delivery.promise.districts']).toBe(spec);
    expect(spec.version).toBe(97);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off with no rows; rows are checked', () => {
    expect(spec.default).toEqual({ enabled: false, rows: [] });
    const row = { district: 'BD-01', hoursMin: 72, hoursMax: 120 };
    expect(districtPromiseSchema.safeParse({ enabled: true, rows: [row] }).success).toBe(true);
    expect(districtPromiseSchema.safeParse({ enabled: true, rows: [{ ...row, hoursMin: null }] }).success).toBe(true);
    expect(districtPromiseSchema.safeParse({ enabled: true, rows: [{ ...row, hoursMin: 130 }] }).success).toBe(false);
    expect(districtPromiseSchema.safeParse({ enabled: true, rows: [row, row] }).success).toBe(false);
    expect(districtPromiseSchema.safeParse({ enabled: true, rows: [{ ...row, hoursMax: 0 }] }).success).toBe(false);
  });
});
