// S08 · PR 175–177 (registry v50): every courier key at version 50, never owner data, labelled in both languages, its
// default valid; the owner's figures ship empty. PR 554 (v56): the courier zone sync.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierBookingSchema, courierTrackingSchema, courierZoneSyncSchema, GIFT_NOTE_TOKENS, handoverSheetSchema, rtoCostSchema, shippingSettings, stickerQueueSchema } from '../src/registry-shipping';

/** The registry version each key arrived at. */
const SINCE: Record<string, number> = { 'delivery.courier.zoneSync': 56, 'delivery.sticker.layout': 56, 'delivery.sticker.exactAmount': 56, 'delivery.sticker.queue': 56, 'delivery.handover.sheet': 56 };

describe('courier shipping settings (v50)', () => {
  it('every key is in the registry at its version (50; PR 554, 179: 56) in the Delivery group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(shippingSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(SINCE[key] ?? 50);
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

  it('PR 554: the zone sync is on, weekly, within 600 calls a run, pairs exact names, and holds a parcel only when the courier needs its ids', () => {
    const z = shippingSettings['delivery.courier.zoneSync'].default;
    expect(z).toEqual({ enabled: true, everyDays: 7, callsPerRun: 600, areas: true, autoMatch: true, unmapped: 'whenRequired' });
    expect(courierZoneSyncSchema.safeParse({ ...z, everyDays: 0 }).success).toBe(false);
    expect(courierZoneSyncSchema.safeParse({ ...z, callsPerRun: 5 }).success).toBe(false);
    expect(courierZoneSyncSchema.safeParse({ ...z, unmapped: 'never' }).success).toBe(false);
    expect(courierZoneSyncSchema.safeParse({ ...z, unmapped: 'always' }).success).toBe(true);
  });

  it('PR 180: a reprint asks why, the last 20 prints are listed; the handover sheet is A4 at 150 dpi with names and signatures', () => {
    expect(shippingSettings['delivery.sticker.queue'].default).toEqual({ reprintReason: true, recentPrints: 20 });
    expect(stickerQueueSchema.safeParse({ reprintReason: true, recentPrints: 1 }).success).toBe(false);
    const h = shippingSettings['delivery.handover.sheet'].default;
    expect(h).toEqual({ paper: 'a4', dpi: 150, lang: 'en', receiverName: true, signatures: true, packOnHandover: true });
    expect(handoverSheetSchema.safeParse({ ...h, dpi: 72 }).success).toBe(false);
    expect(handoverSheetSchema.safeParse({ ...h, paper: 'letter' }).success).toBe(false);
  });
});
