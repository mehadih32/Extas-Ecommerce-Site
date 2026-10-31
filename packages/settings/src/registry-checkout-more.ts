// S04 · the rest of the customer-side checkout — PR 563 (no order is ever held over an address), PR 561 (the silent
// address backfill), PR 127 ("Add to this parcel"), PR 128 ("Complete your look"), PR 605 (gift mode). Registry version 34
// (33 is the admin shell's). Labels: messages/checkout-more.<lang>.json. No admin screen yet (CN-019, CN-022): the keys
// live in their sections (Checkout, Orders) and are set through the settings store until the new admin shell has them.
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone. A check only adds a flag and a call
// task for the team; the order is always taken (PR 563). The backfill only attaches an address the shop already holds,
// for packing; it is never shown or prefilled (PR 561). An added line is priced as its product page prices it and
// changes nothing else on the order (PR 127).
import { z } from 'zod';
import { setting } from './define';

const V = 34;

const word = z.string().trim().min(1).max(40);

/**
 * PR 563, SIM-F-030 — the address-detail check: a line with none of these words (a house, a road, a para, a village …)
 * still becomes an order, but it is flagged "address check" and the confirmation call asks for directions. Never a
 * hold. The words are matched whole (after the gazetteer's spelling fold), so "gram" never matches "Kurigram"; a word
 * followed straight by a number counts too ("h12", "rd5"). The owner adds or removes words in both scripts.
 */
export const addressCheckSchema = z
  .object({
    enabled: z.boolean(),
    words: z.array(word).max(200),
  })
  .strict();

/** The starting words: English, Banglish and Bengali ways of writing where in a place the house is. */
export const ADDRESS_DETAIL_WORDS = [
  'house',
  'home',
  'h',
  'holding',
  'road',
  'rd',
  'lane',
  'ln',
  'street',
  'st',
  'avenue',
  'goli',
  'gali',
  'para',
  'mohalla',
  'moholla',
  'block',
  'sector',
  'section',
  'flat',
  'floor',
  'apartment',
  'apt',
  'building',
  'bldg',
  'tower',
  'plot',
  'village',
  'vill',
  'gram',
  'bari',
  'basa',
  'bhaban',
  'বাড়ি',
  'বাসা',
  'বাসভবন',
  'হোল্ডিং',
  'রোড',
  'সড়ক',
  'লেন',
  'গলি',
  'পাড়া',
  'মহল্লা',
  'ব্লক',
  'সেক্টর',
  'ফ্ল্যাট',
  'তলা',
  'ভবন',
  'প্লট',
  'গ্রাম',
] as const;

/**
 * PR 561 — the silent address backfill. A line that names no place ("Road 12, House 42") is asked Inside/Outside Dhaka
 * — unless his phone number is already known: then nothing is asked, shown or prefilled, the band comes from the
 * address the shop holds, what he typed stays as he typed it, and that full held address is attached to the order in
 * the backend for packing. A line that settles a place itself always wins (he may have moved, or be sending a gift).
 * `orders`: where else a held address may come from when he has no saved address — none, his delivered orders only,
 * or any order of his not cancelled or returned. The look-ups count against the phone-first limit per IP.
 */
export const addressBackfillSchema = z
  .object({
    enabled: z.boolean(),
    orders: z.enum(['off', 'delivered', 'placed']),
  })
  .strict();

/**
 * PR 127 — "Add to this parcel": the customer adds a piece to his own Cash on Delivery order from the thank-you page
 * or his order page, as a real order line, until the owner's step (`until`: while the order is new, or also after
 * the team confirms it, until picking starts) and, when set, `windowMinutes` after placing (0: no time limit). Never
 * once a courier is booked. At most `maxLines` added lines of `maxUnits` pieces each. Off until the owner turns it on.
 */
export const addOnSchema = z
  .object({
    enabled: z.boolean(),
    until: z.enum(['placed', 'confirmed']),
    windowMinutes: z.int().min(0).max(10_080),
    maxLines: z.int().min(1).max(20),
    maxUnits: z.int().min(1).max(20),
  })
  .strict();

/**
 * PR 128 — "Complete your look" on the thank-you page: up to `max` pieces that the shop's own running combos pair with
 * what he ordered, each with "Add" while "Add to this parcel" (`orders.addOn`) is open for his order. No combo, no
 * block. Off until the owner turns it on.
 */
export const thanksLookSchema = z.object({ enabled: z.boolean(), max: z.int().min(1).max(6) }).strict();

/**
 * PR 605 (CN-014 h, CN-020 (2)) — gift mode: "Send as a gift" in the bag opens the checkout as a gift. The order's name,
 * phone and address are the receiver's; the sender gives his name and a contact (a phone of any country or an e-mail,
 * only for updates). A gift note of up to `noteMaxChars` (0: none), a "deliver on or after" date up to
 * `deliverAfterMaxDays` ahead (0: no date), prices hidden on the receiver's invoice (`hidePricesDefault` ticked at the
 * start; he may untick it). `advance`: with `required` on, a gift is paid ahead — `full` is the whole amount, through the
 * checkout's own payment step (Cash on Delivery is not offered); `fixed` (`amountMinor`) and `percent` (`percent`) take
 * part ahead and the rest at the door — until the part payment of S07 arrives, the team is asked to call for that part.
 * Off until the owner turns it on.
 */
export const giftSchema = z
  .object({
    enabled: z.boolean(),
    advance: z
      .object({
        required: z.boolean(),
        type: z.enum(['full', 'fixed', 'percent']),
        amountMinor: z.int().min(1).nullable(),
        percent: z.int().min(1).max(100).nullable(),
      })
      .strict(),
    noteMaxChars: z.int().min(0).max(1_000),
    deliverAfterMaxDays: z.int().min(0).max(365),
    hidePricesDefault: z.boolean(),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: false, version: V } as const;

export const checkoutMoreSettings = {
  'checkout.address.check': setting({
    ...json,
    group: 'checkout',
    schema: addressCheckSchema,
    default: { enabled: true, words: [...ADDRESS_DETAIL_WORDS] },
    labelKey: 'checkout.address.check.label',
    helpKey: 'checkout.address.check.help',
    sortOrder: 960,
  }),
  'checkout.address.backfill': setting({
    ...json,
    group: 'checkout',
    schema: addressBackfillSchema,
    default: { enabled: false, orders: 'delivered' },
    labelKey: 'checkout.address.backfill.label',
    helpKey: 'checkout.address.backfill.help',
    sortOrder: 961,
  }),
  'orders.addOn': setting({
    ...json,
    group: 'orders',
    schema: addOnSchema,
    default: { enabled: false, until: 'confirmed', windowMinutes: 0, maxLines: 3, maxUnits: 1 },
    labelKey: 'orders.addOn.label',
    helpKey: 'orders.addOn.help',
    sortOrder: 962,
  }),
  'thanks.look': setting({
    ...json,
    group: 'checkout',
    schema: thanksLookSchema,
    default: { enabled: false, max: 3 },
    labelKey: 'thanks.look.label',
    helpKey: 'thanks.look.help',
    sortOrder: 963,
  }),
  // Review R1 (M5, registry version 120): a percentage cut (a percent code, the prepaid reward's percent) is rounded to
  // this step of money, in the customer's favour, so every total is an amount a rider can collect (100 = whole taka;
  // 1 = not rounded). The options are fixed steps; the owner picks one.
  'checkout.money.roundingStepMinor': setting({
    schema: z.union([z.literal(1), z.literal(100), z.literal(500), z.literal(1000)]),
    default: 100,
    scope: 'store',
    valueType: 'INT',
    group: 'checkout',
    labelKey: 'checkout.money.roundingStepMinor.label',
    helpKey: 'checkout.money.roundingStepMinor.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 965,
    version: 120,
  }),
  'checkout.gift': setting({
    ...json,
    group: 'checkout',
    schema: giftSchema,
    default: { enabled: false, advance: { required: true, type: 'full', amountMinor: null, percent: null }, noteMaxChars: 200, deliverAfterMaxDays: 30, hidePricesDefault: true },
    labelKey: 'checkout.gift.label',
    helpKey: 'checkout.gift.help',
    sortOrder: 964,
  }),
};

export type AddressCheckSettings = z.output<typeof addressCheckSchema>;
export type AddressBackfillSettings = z.output<typeof addressBackfillSchema>;
export type AddOnSettings = z.output<typeof addOnSchema>;
export type ThanksLookSettings = z.output<typeof thanksLookSchema>;
export type GiftSettings = z.output<typeof giftSchema>;
