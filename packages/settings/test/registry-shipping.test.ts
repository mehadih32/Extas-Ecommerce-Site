// S08 · PR 175–177 (registry v50): every courier key at version 50, never owner data, labelled in both languages, its
// default valid; the owner's figures ship empty.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierBookingSchema, courierTrackingSchema, GIFT_NOTE_TOKENS, rtoCostSchema, shippingSettings } from '../src/registry-shipping';

describe('courier shipping settings (v50)', () => {
  it('every key is in the registry at version 50 in the Delivery group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(shippingSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(50);
      expect(spec.group, key).toBe('delivery');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 175 (SIM-F-027): the RTO cost counts both courier legs, and the owner\'s figures ship empty', () => {
    const d = shippingSettings['delivery.courier.rtoCost'].default;
    expect(d.count).toMatchObject({ forward: true, return: true, packaging: true, handling: true, adShare: false });
    expect([d.packagingMinor, d.handlingMinor, d.adShareMinor]).toEqual([null, null, null]);
    expect(rtoCostSchema.safeParse({ ...d, packagingMinor: -1 }).success).toBe(false);
    expect(rtoCostSchema.safeParse({ ...d, packagingMinor: 0 }).success).toBe(true);
  });

  it('PR 176: booking — gifts booked on their day by default, the gift line in both languages with known tokens only; tracking on, hourly', () => {
    const b = shippingSettings['delivery.courier.booking'].default;
    expect(b).toMatchObject({ giftLeadDays: 0, noteLang: 'en', itemNames: true, maxPerRun: 100 });
    for (const lang of ['en', 'bn'] as const) for (const t of GIFT_NOTE_TOKENS) expect(b.giftNote[lang], `${lang} ${t}`).toContain(`{${t}}`);
    expect(courierBookingSchema.safeParse({ ...b, giftNote: { ...b.giftNote, en: 'From {phone}' } }).success).toBe(false);
    expect(courierBookingSchema.safeParse({ ...b, maxPerRun: 0 }).success).toBe(false);
    expect(shippingSettings['delivery.courier.tracking'].default).toEqual({ enabled: true, everyMinutes: 60, batch: 200 });
    expect(courierTrackingSchema.safeParse({ enabled: true, everyMinutes: 1, batch: 200 }).success).toBe(false);
  });
});
