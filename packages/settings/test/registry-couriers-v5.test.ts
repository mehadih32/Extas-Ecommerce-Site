// S28 · PR 670 (registry v310): the default courier — never owner data, labelled in both languages, empty as shipped (the
// first courier is the default until the owner picks one), a courier id or empty text.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { couriersV5Settings } from '../src/registry-couriers-v5';

describe('couriers setting (v310)', () => {
  it('delivery.couriers is in the registry at version 310, labelled in both languages, empty as shipped', () => {
    const spec = couriersV5Settings['delivery.couriers'];
    expect(registry['delivery.couriers']).toBe(spec);
    expect(spec.version).toBe(310);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ defaultCourierId: '' });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it('the default is a courier id or empty text, nothing else', () => {
    const s = couriersV5Settings['delivery.couriers'].schema;
    expect(s.safeParse({ defaultCourierId: '3f0c2a52-6a5b-4a5f-9a53-2f4d8f0a1b11' }).success).toBe(true);
    expect(s.safeParse({ defaultCourierId: 'x' }).success).toBe(false);
    expect(s.safeParse({ defaultCourierId: '', extra: 1 }).success).toBe(false);
  });
});
