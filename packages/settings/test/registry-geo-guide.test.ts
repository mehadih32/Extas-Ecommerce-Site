// S13 · PR 569 (registry v255): geography-led ad guidance — advice only, off as shipped, 90 days, 10 orders, more up to
// 10 % returns, less from 30 %, every number bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { GEO_GUIDE_DEFAULT, geoGuideSchema, geoGuideSettings } from '../src/registry-geo-guide';

describe('geo guide (v255)', () => {
  it('is in the registry at version 255, per store, labelled in English and Bengali, its default valid', () => {
    const s = geoGuideSettings['ads.geoGuide'];
    expect(registry['ads.geoGuide']).toBe(s);
    expect(s.version).toBe(255);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off', () => {
    expect(GEO_GUIDE_DEFAULT).toEqual({ on: false, days: 90, minOrders: 10, goodReturnPct: 10, badReturnPct: 30 });
  });

  it('keeps every number in bounds, "more" below "less", and refuses a budget field', () => {
    const ok = (patch: Record<string, unknown>) => geoGuideSchema.safeParse({ ...GEO_GUIDE_DEFAULT, ...patch }).success;
    expect(ok({ on: true, days: 365, minOrders: 1 })).toBe(true);
    expect(ok({ goodReturnPct: 30, badReturnPct: 30 })).toBe(false);
    expect(ok({ days: 6 })).toBe(false);
    expect(ok({ minOrders: 0 })).toBe(false);
    expect(ok({ budgetShift: 10 })).toBe(false);
  });
});
