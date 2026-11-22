// S29 · PR 752 (registry v868): Reports › Geography map — one store setting, off as shipped, every number bounded and
// editable, the lenses, slices and advisor all off, labelled in English and Bengali, no key that could change a budget.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { GEO_MAP_DEFAULT, geoMapSchema, geoMapSettings } from '../src/registry-geo-map';

describe('geo map setting (v868)', () => {
  it('is in the registry at version 868, per store, JSON, labelled in English and Bengali, its default valid', () => {
    const s = geoMapSettings['reports.geoMap'];
    expect(registry['reports.geoMap']).toBe(s);
    expect(s.version).toBe(868);
    expect(s.scope).toBe('store');
    expect(s.valueType).toBe('JSON');
    expect(s.isOwnerData).toBe(false);
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it("has no on/off switch: only numbers and choices, the compare starts off", () => {
    expect(GEO_MAP_DEFAULT.compareDefault).toBe(false);
    for (const retired of ["on", "slices", "lenses", "ai"])
      expect(GEO_MAP_DEFAULT).not.toHaveProperty(retired);
  });

  it("reads an older stored value that still has the retired switch keys, without them", () => {
    const r = geoMapSchema.safeParse({
      ...GEO_MAP_DEFAULT,
      on: true,
      lenses: { risk: true },
      slices: { channel: true },
      ai: true,
    });
    expect(r.success).toBe(true);
    if (r.success)
      for (const retired of ["on", "slices", "lenses", "ai"])
        expect(r.data).not.toHaveProperty(retired);
  });

  it("keeps every number in bounds", () => {
    const ok = (patch: Record<string, unknown>) =>
      geoMapSchema.safeParse({ ...GEO_MAP_DEFAULT, ...patch }).success;
    expect(ok({ minOrders: 0 })).toBe(true);
    expect(ok({ minOrders: -1 })).toBe(false);
    expect(ok({ minOrders: 1001 })).toBe(false);
    expect(ok({ colourSteps: 2 })).toBe(false);
    expect(ok({ colourSteps: 9 })).toBe(true);
    expect(ok({ colourSteps: 10 })).toBe(false);
    expect(ok({ warnReturnPct: 0 })).toBe(false);
    expect(ok({ warnReturnPct: 101 })).toBe(false);
    expect(ok({ topProducts: 0 })).toBe(false);
    expect(ok({ topProducts: 21 })).toBe(false);
    expect(ok({ cacheSeconds: 0 })).toBe(true);
    expect(ok({ cacheSeconds: 3601 })).toBe(false);
    expect(ok({ minOrders: 2.5 })).toBe(false);
  });

  it('takes only the opening periods and figures the page has', () => {
    const ok = (patch: Record<string, unknown>) => geoMapSchema.safeParse({ ...GEO_MAP_DEFAULT, ...patch }).success;
    for (const p of ['day', 'month', 'sixMonths', 'year']) expect(ok({ defaultPeriod: p }), p).toBe(true);
    expect(ok({ defaultPeriod: 'custom' })).toBe(false);
    for (const m of ['orders', 'sales', 'delivered', 'returned', 'returnRate']) expect(ok({ defaultMetric: m }), m).toBe(true);
    expect(ok({ defaultMetric: 'change' })).toBe(false); // "change" needs a second period, it is never an opening figure
  });

  it('refuses an unknown field, in particular anything that would change a budget, a price or a courier', () => {
    const ok = (patch: Record<string, unknown>) => geoMapSchema.safeParse({ ...GEO_MAP_DEFAULT, ...patch }).success;
    expect(ok({ budgetShift: 10 })).toBe(false);
    expect(ok({ freeDeliveryFrom: 2000 })).toBe(false);
    expect(ok({ price: true })).toBe(false);
  });
});
