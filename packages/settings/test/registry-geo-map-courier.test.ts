// S29 · PR 757 (registry v805): the courier lens's numbers — in the registry at version 805, per store, labelled in both
// languages, every number bounded and editable, nothing that could change a courier rule.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { GEO_MAP_COURIER_DEFAULT, geoMapCourierSchema, geoMapCourierSettings } from '../src/registry-geo-map-courier';

describe('geo map courier lens numbers (v805)', () => {
  it('is in the registry at version 805, per store, labelled in English and Bengali, its default valid', () => {
    const s = geoMapCourierSettings['reports.geoMapCourier'];
    expect(registry['reports.geoMapCourier']).toBe(s);
    expect(s.version).toBe(805);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });
  it('keeps every number in bounds and refuses anything else', () => {
    const ok = (patch: Record<string, unknown>) => geoMapCourierSchema.safeParse({ ...GEO_MAP_COURIER_DEFAULT, ...patch }).success;
    expect(ok({ minParcels: 1, lowSuccessPct: 0, lateWarnPct: 100, gapLimit: 200 })).toBe(true);
    expect(ok({ minParcels: 0 })).toBe(false);
    expect(ok({ lowSuccessPct: 101 })).toBe(false);
    expect(ok({ lateWarnPct: -1 })).toBe(false);
    expect(ok({ gapLimit: 0 })).toBe(false);
    expect(ok({ gapLimit: 201 })).toBe(false);
    expect(ok({ courierRule: 'x' })).toBe(false);
  });
});
