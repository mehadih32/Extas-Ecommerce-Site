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
//
// PR 554 (registry version 56, `delivery.courier.zoneSync`): reading each courier's own place list (cities → zones →
// areas) and matching it to the shop's areas. How often the list is read again, how many courier calls one run may
// make, whether the areas level is read, whether names that match exactly are paired on their own (a person always can
// change a pair; an unclear name is never guessed), and when a parcel waits for a person to pair its area: only when
// the courier needs its own ids (`whenRequired`), or for every courier that takes them (`always`).
//
// PR 179 (registry version 56, `delivery.sticker.layout`, `delivery.sticker.exactAmount`): the courier sticker — its
// size (the common thermal rolls, A6/A5 paper, four on an A4 sheet, or the owner's own size), the printer's dots per
// inch, the sticker's language, the type size and how small it may get before the pieces carry on onto a second
// sticker; and the exact-amount line (CN-014b idea 10): off by default, never printed on a paid parcel, its words in
// both languages and a short report link or number the owner types (empty until he does).
import { z } from 'zod';
import { setting } from './define';
import { moneyMinorSchema, templateTextSchema } from './schemas';

const V = 50;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'delivery', version: V } as const;
const V56 = 56;
const base56 = { ...base, version: V56 } as const;

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

/** PR 554 — when a parcel to an area not paired with the courier's own place waits for a person. */
export const ZONE_UNMAPPED_RULES = ['whenRequired', 'always'] as const;

/**
 * PR 554 — the courier zone sync. `enabled`: the worker reads every courier's place list on its own, every `everyDays`
 * days (staff can always press "Read the list now"); `callsPerRun`: how many courier calls one run makes before it
 * stops and goes on next time; `areas`: the third level (areas) is read too; `autoMatch`: a courier place whose name is
 * exactly one of the shop's areas is paired on its own; `unmapped`: see ZONE_UNMAPPED_RULES.
 */
export const courierZoneSyncSchema = z
  .object({
    enabled: z.boolean(),
    everyDays: z.int().min(1).max(90),
    callsPerRun: z.int().min(10).max(5_000),
    areas: z.boolean(),
    autoMatch: z.boolean(),
    unmapped: z.enum(ZONE_UNMAPPED_RULES),
  })
  .strict();

/** PR 179 — the sticker sizes on offer: thermal rolls (width × height in mm), paper, four on an A4 sheet, or custom. */
export const STICKER_SIZES = ['100x150', '100x100', '75x100', 'a6', 'a5', 'a4x4', 'custom'] as const;
/** PR 179 — the printer's dots per inch: 203 (most thermal sticker printers) or 300. */
export const STICKER_DPIS = [203, 300] as const;

/**
 * PR 179 — the courier sticker. `size`: see STICKER_SIZES; `customMm`: the size when `size` is custom; `dpi`: see
 * STICKER_DPIS; `lang`: the language of the sticker's own words (the receiver's address prints as it was typed);
 * `scalePercent`: the type size (100 = normal); `minScalePercent`: the smallest the type may get to keep one sticker per
 * parcel before the pieces carry on onto a second one; `showShop`: the shop's name and phone at the top; `maxPerPdf`: how
 * many parcels one print takes (the rest wait for the next press).
 */
export const stickerLayoutSchema = z
  .object({
    size: z.enum(STICKER_SIZES),
    customMm: z.object({ width: z.int().min(40).max(210), height: z.int().min(40).max(297) }).strict(),
    dpi: z.union([z.literal(STICKER_DPIS[0]), z.literal(STICKER_DPIS[1])]),
    lang: z.enum(['en', 'bn']),
    scalePercent: z.int().min(70).max(150),
    minScalePercent: z.int().min(50).max(100),
    showShop: z.boolean(),
    maxPerPdf: z.int().min(1).max(500),
  })
  .strict()
  .refine((v) => v.minScalePercent <= v.scalePercent, { message: 'the smallest type cannot be larger than the type', path: ['minScalePercent'] });

/** The `{tokens}` the sticker's exact-amount line may use. */
export const STICKER_EXACT_TOKENS = ['amount', 'link'] as const;

/**
 * PR 179 (CN-014b idea 10) — the exact-amount line under the amount to collect: "Pay exactly {amount}. The rider may
 * not ask for more." `link`: what {link} prints (a short report link or a WhatsApp number; empty until the owner types
 * it). Off by default; never printed on a parcel with nothing to collect.
 */
export const stickerExactAmountSchema = z
  .object({ enabled: z.boolean(), text: templateTextSchema(STICKER_EXACT_TOKENS, 160), link: z.string().trim().min(1).max(120).nullable() })
  .strict();

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
  'delivery.courier.zoneSync': setting({
    ...base56,
    valueType: 'JSON',
    schema: courierZoneSyncSchema,
    default: { enabled: true, everyDays: 7, callsPerRun: 600, areas: true, autoMatch: true, unmapped: 'whenRequired' },
    labelKey: 'delivery.courier.zoneSync.label',
    helpKey: 'delivery.courier.zoneSync.help',
    sortOrder: 903,
  }),
  'delivery.sticker.layout': setting({
    ...base56,
    valueType: 'JSON',
    schema: stickerLayoutSchema,
    default: { size: '100x150', customMm: { width: 100, height: 150 }, dpi: 203, lang: 'en', scalePercent: 100, minScalePercent: 80, showShop: true, maxPerPdf: 100 }, // hardcode-ok: the sticker's normal type (100 %) and the smallest it may shrink to (80 %); the owner changes both here
    labelKey: 'delivery.sticker.layout.label',
    helpKey: 'delivery.sticker.layout.help',
    sortOrder: 910,
  }),
  'delivery.sticker.exactAmount': setting({
    ...base56,
    valueType: 'JSON',
    schema: stickerExactAmountSchema,
    default: {
      enabled: false,
      text: { en: 'Pay exactly {amount}. The rider may not ask for more. {link}', bn: 'ঠিক {amount} দিন। ডেলিভারিম্যান এর বেশি চাইতে পারবেন না। {link}' },
      link: null,
    },
    labelKey: 'delivery.sticker.exactAmount.label',
    helpKey: 'delivery.sticker.exactAmount.help',
    sortOrder: 911,
  }),
};

export type RtoCostSettings = z.output<typeof rtoCostSchema>;
export type CourierBookingSettings = z.output<typeof courierBookingSchema>;
export type CourierTrackingSettings = z.output<typeof courierTrackingSchema>;
export type CourierZoneSyncSettings = z.output<typeof courierZoneSyncSchema>;
export type StickerLayoutSettings = z.output<typeof stickerLayoutSchema>;
export type StickerExactAmountSettings = z.output<typeof stickerExactAmountSchema>;
