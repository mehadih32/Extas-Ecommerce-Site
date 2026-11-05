// S04 · PR 622 (CN-034, 1 Nov 2026; customer 360° finding 3, step `account/reorder`) — "Buy again" on a past order.
// Registry version 220 (lane C's range). Labels: messages/account-reorder.<lang>.json; the admin's place is Customers →
// Customer settings (the customer-account settings, docs/ADMIN-ARCHITECTURE.md: settings sit in their section).
//
// `account.reorder` (per store): off as it ships (CN-034 (5)).
// - `enabled`: the switch. Off: no button anywhere and the shop's reorder answer refuses.
// - `states`: the order states that offer it (delivered, as shipped). A draft never does.
// - `inList`: My orders shows it on each offered order's card too (not only on the order's own page).
// - `words`: the button, the line beside it and the notice after a tap, in English and Bengali. `{n}` is how many
//   pieces went in, `{name}` the product, `{size}` its size, `{sizes}` the sizes still in stock.
//
// "Buy again" only fills the bag — at today's price, offers and stock, never the old order's. Nothing is ordered until
// the customer goes through the normal checkout, so the delivery charge, COD and every offer rule stay the checkout's
// own. Nothing here changes a price, a discount or COD, moves money, blocks or deletes anything.
import { z } from 'zod';
import { setting } from './define';

/** The order states an owner may let offer "Buy again" (every stored state but a draft). */
export const REORDER_STATES = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] as const;
export type ReorderState = (typeof REORDER_STATES)[number];

/** The words of "Buy again", each in English and Bengali. */
export const REORDER_WORDS = ['button', 'hint', 'added', 'soldOut', 'inStock', 'gone', 'nothing', 'goBag'] as const;
export type ReorderWord = (typeof REORDER_WORDS)[number];

/** The longest a word may be. */
export const REORDER_WORDS_MAX = 160;

const pair = z.object({ en: z.string().trim().min(1).max(REORDER_WORDS_MAX), bn: z.string().trim().min(1).max(REORDER_WORDS_MAX) }).strict();

export const accountReorderSchema = z
  .object({
    enabled: z.boolean(),
    states: z
      .array(z.enum(REORDER_STATES))
      .min(1)
      .max(REORDER_STATES.length)
      .refine((a) => new Set(a).size === a.length, 'each state once'),
    inList: z.boolean(),
    words: z.object(Object.fromEntries(REORDER_WORDS.map((k) => [k, pair])) as Record<ReorderWord, typeof pair>).strict(),
  })
  .strict();
export type AccountReorderSettings = z.output<typeof accountReorderSchema>;

export const accountReorderSettings = {
  'account.reorder': setting({
    scope: 'store',
    group: 'accounts',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: accountReorderSchema,
    default: {
      enabled: false,
      states: ['DELIVERED'],
      inList: true,
      words: {
        button: { en: 'Buy again', bn: 'আবার কিনুন' },
        hint: { en: 'Puts these items in your bag at the current price. Nothing is ordered until you check out.', bn: 'এখনকার দামে এই জিনিসগুলো ব্যাগে যাবে। চেকআউট না করা পর্যন্ত কোনো অর্ডার হবে না।' },
        added: { en: 'Now in your bag at the current price: {n}', bn: 'এখনকার দামে ব্যাগে আছে: {n}টা' },
        soldOut: { en: '{name}, size {size}, is sold out.', bn: '{name}, সাইজ {size}, স্টকে নেই।' },
        inStock: { en: 'In stock: {sizes}', bn: 'স্টকে আছে: {sizes}' },
        gone: { en: '{name} is no longer sold.', bn: '{name} এখন আর বিক্রি হয় না।' },
        nothing: { en: 'Nothing from this order can be bought right now.', bn: 'এই অর্ডারের কিছুই এখন কেনা যাচ্ছে না।' },
        goBag: { en: 'Go to bag', bn: 'ব্যাগে যান' },
      },
    },
    labelKey: 'account.reorder.label',
    helpKey: 'account.reorder.help',
    sortOrder: 86,
    version: 220,
  }),
};
