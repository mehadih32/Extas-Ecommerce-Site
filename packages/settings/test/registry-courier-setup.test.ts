// S28 · PR 803 (registry v803): Couriers › Setup — per courier: pick-up place and time, smallest payout, pay days.
// Not owner data, empty as shipped, labelled in both languages, strict about its shape.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierSetupSettings } from '../src/registry-courier-setup';

const ID = '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11';
const ok = { pickupPlace: 'Warehouse', pickupTime: '17:00', minPayoutMinor: 500000, payDays: 3 };

describe('courier setup setting (v803)', () => {
  const spec = courierSetupSettings['delivery.courier.setup'];
  it('is in the registry at version 803, labelled in both languages, empty as shipped', () => {
    expect(registry['delivery.courier.setup']).toBe(spec);
    expect(spec.version).toBe(803);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ couriers: {} });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it('takes a courier id with a whole entry, and nothing else', () => {
    const s = spec.schema;
    expect(s.safeParse({ couriers: { [ID]: ok } }).success).toBe(true);
    expect(s.safeParse({ couriers: { x: ok } }).success).toBe(false);
    expect(s.safeParse({ couriers: { [ID]: { ...ok, extra: 1 } } }).success).toBe(false);
    expect(s.safeParse({ couriers: {}, other: 1 }).success).toBe(false);
  });
  it('checks the time, the amount and the days', () => {
    const s = spec.schema;
    const one = (e: object) => s.safeParse({ couriers: { [ID]: { ...ok, ...e } } }).success;
    expect(one({ pickupTime: '' })).toBe(true);
    expect(one({ pickupTime: '24:00' })).toBe(false);
    expect(one({ pickupTime: '5pm' })).toBe(false);
    expect(one({ minPayoutMinor: -1 })).toBe(false);
    expect(one({ payDays: 15 })).toBe(false);
    expect(one({ payDays: 0 })).toBe(true);
  });
});
