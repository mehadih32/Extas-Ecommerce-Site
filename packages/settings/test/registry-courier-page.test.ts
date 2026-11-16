// PR 1010 (registry v1010): Settings › Couriers — the pick-up place and time, and auto-booking (off as shipped).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierPageSettings } from '../src/registry-courier-page';

const STAFF = '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11';

describe('courier page settings (v1010)', () => {
  for (const key of ['delivery.courier.pickup', 'delivery.courier.autoBook'] as const) {
    const spec = courierPageSettings[key];
    it(`${key} is in the registry at version 1010, labelled in both languages, with a default that passes`, () => {
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(1010);
      expect(spec.isOwnerData).toBe(false);
      expect(spec.schema.safeParse(spec.default).success).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
      }
    });
  }
  it('auto-booking is off as shipped and names nobody', () => {
    expect(courierPageSettings['delivery.courier.autoBook'].default).toEqual({ enabled: false, byStaffId: '', everyMinutes: 5 });
  });
  it('pick-up takes the warehouse or the office and a 24-hour time, and nothing else', () => {
    const s = courierPageSettings['delivery.courier.pickup'].schema;
    expect(s.safeParse({ from: 'office', time: '17:30' }).success).toBe(true);
    expect(s.safeParse({ from: 'warehouse', time: '' }).success).toBe(true);
    expect(s.safeParse({ from: 'shop', time: '' }).success).toBe(false);
    expect(s.safeParse({ from: 'office', time: '24:00' }).success).toBe(false);
    expect(s.safeParse({ from: 'office', time: '5pm' }).success).toBe(false);
    expect(s.safeParse({ from: 'office', time: '', extra: 1 }).success).toBe(false);
  });
  it('auto-booking takes a person id or nothing', () => {
    const s = courierPageSettings['delivery.courier.autoBook'].schema;
    expect(s.safeParse({ enabled: true, byStaffId: STAFF, everyMinutes: 5 }).success).toBe(true);
    expect(s.safeParse({ enabled: true, byStaffId: STAFF, everyMinutes: 0 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, byStaffId: 'me', everyMinutes: 5 }).success).toBe(false);
    expect(s.safeParse({ enabled: true }).success).toBe(false);
  });
});
