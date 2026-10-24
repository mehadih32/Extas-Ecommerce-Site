// S08 · courier shipping (PR 175–177). Registry version 50. Labels: messages/shipping.<lang>.json (the Delivery group;
// the admin's place is Delivery → Delivery settings, DLV-08 of docs/BACKEND-ARCHITECTURE.md §5.6, on the new admin
// shell). Every courier runs on its practice world until the owner types its keys into Keys & connections.
//
// PR 175 (`delivery.courier.rtoCost`, SIM-F-027): what a parcel that came back cost the shop — both legs of the courier,
// packaging, handling and, when the owner counts it, the ad share. The courier's own charges come from its rate card
// (owner data, empty by default); packaging, handling and the ad share are the owner's figures here, empty until he
// types them. A counted part with no figure is shown as missing, never as zero. Nothing here moves money.
//
// PR 176 (`delivery.courier.booking`, `delivery.courier.tracking`): booking is a staff action (never automatic); a gift
// with "deliver on or after" is held until its booking day (SIM-F-007); the courier note's gift line in both languages;
// how many orders one "Book all" takes; how often the parcels the couriers hold are read again.
import { z } from 'zod';
import { setting } from './define';
import { moneyMinorSchema, templateTextSchema } from './schemas';

const V = 50;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'delivery', version: V } as const;

/**
 * PR 175 (SIM-F-027) — the RTO cost book. `count`: which parts of a returned parcel's cost are counted (the courier's
 * charge out, its charge back, packaging, handling, the ad share). `packagingMinor`, `handlingMinor`: the owner's cost
 * per parcel; `adShareMinor`: the ad cost he puts on each order. All empty until he types them.
 */
export const rtoCostSchema = z
  .object({
    count: z.object({ forward: z.boolean(), return: z.boolean(), packaging: z.boolean(), handling: z.boolean(), adShare: z.boolean() }).strict(),
    packagingMinor: moneyMinorSchema.nullable(),
    handlingMinor: moneyMinorSchema.nullable(),
    adShareMinor: moneyMinorSchema.nullable(),
  })
  .strict();

/** The `{tokens}` the courier note's gift line may use. */
export const GIFT_NOTE_TOKENS = ['date', 'note', 'sender'] as const;

/**
 * PR 176 — booking a courier. `giftLeadDays`: a gift to be delivered on or after a day is booked no earlier than this
 * many days before it (0: on the day itself; SIM-F-007). `giftNote`: the line the courier's note carries for a gift
 * ({date}: the day, {note}: the gift note, {sender}: who it is from), and `noteLang` the language the note is written
 * in. `itemNames`: the parcel's description lists the pieces (else only how many). `maxPerRun`: how many orders one
 * "Book all" takes; the rest wait for the next press.
 */
export const courierBookingSchema = z
  .object({
    giftLeadDays: z.int().min(0).max(30),
    giftNote: templateTextSchema(GIFT_NOTE_TOKENS, 200),
    noteLang: z.enum(['en', 'bn']),
    itemNames: z.boolean(),
    maxPerRun: z.int().min(1).max(500),
  })
  .strict();

/**
 * PR 176 — reading the parcels the couriers hold. `enabled`: the worker reads them on its own; `everyMinutes`: how long
 * a parcel waits between two reads; `batch`: how many parcels one run reads. Staff can always read one parcel now.
 */
export const courierTrackingSchema = z.object({ enabled: z.boolean(), everyMinutes: z.int().min(5).max(24 * 60), batch: z.int().min(1).max(2_000) }).strict();

export const shippingSettings = {
  'delivery.courier.rtoCost': setting({
    ...base,
    valueType: 'JSON',
    schema: rtoCostSchema,
    default: { count: { forward: true, return: true, packaging: true, handling: true, adShare: false }, packagingMinor: null, handlingMinor: null, adShareMinor: null },
    labelKey: 'delivery.courier.rtoCost.label',
    helpKey: 'delivery.courier.rtoCost.help',
    sortOrder: 900,
  }),
  'delivery.courier.booking': setting({
    ...base,
    valueType: 'JSON',
    schema: courierBookingSchema,
    default: {
      giftLeadDays: 0,
      giftNote: { en: 'Gift from {sender}: deliver on or after {date}. {note}', bn: '{sender}-এর উপহার: {date} বা তার পরে দেবেন। {note}' },
      noteLang: 'en',
      itemNames: true,
      maxPerRun: 100,
    },
    labelKey: 'delivery.courier.booking.label',
    helpKey: 'delivery.courier.booking.help',
    sortOrder: 901,
  }),
  'delivery.courier.tracking': setting({
    ...base,
    valueType: 'JSON',
    schema: courierTrackingSchema,
    default: { enabled: true, everyMinutes: 60, batch: 200 },
    labelKey: 'delivery.courier.tracking.label',
    helpKey: 'delivery.courier.tracking.help',
    sortOrder: 902,
  }),
};

export type RtoCostSettings = z.output<typeof rtoCostSchema>;
export type CourierBookingSettings = z.output<typeof courierBookingSchema>;
export type CourierTrackingSettings = z.output<typeof courierTrackingSchema>;
