// S04 · the rest of the customer-side checkout — PR 563 (no order is ever held over an address). Registry version 34
// (33 is the admin shell's). Labels: messages/checkout-more.<lang>.json. No admin screen yet (CN-019, CN-022): the keys
// live in their sections (Checkout, Orders) and are set through the settings store until the new admin shell has them.
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone. A check only adds a flag and a call
// task for the team; the order is always taken (PR 563).
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
};

export type AddressCheckSettings = z.output<typeof addressCheckSchema>;
