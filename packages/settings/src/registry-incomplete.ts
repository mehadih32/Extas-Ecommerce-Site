// S13 · PR 274 (register "Incomplete-order capture"; SIM-F-026; Blueprint C6.3) — registry version 179, lane B.
//
// - `orders.incomplete`: how Orders › Incomplete reads an unfinished checkout.
//   - `leftAfterMinutes`: minutes after the customer's last typing (or a prepaid payment's last word) before it counts
//     as left and shows on the list; before that he may still be typing or paying.
// What is kept, and for how many days, stays with the checkout's own settings (`checkout.capture.enabled`, off as it
// ships, and `checkout.capture.keepDays`); this key only reads them.
import { z } from 'zod';
import { setting } from './define';

const V274 = 179;

export const incompleteOrdersSchema = z
  .object({
    /** Minutes without a new word before an unfinished checkout counts as left. */
    leftAfterMinutes: z.number().int().min(5).max(1_440),
  })
  .strict();
export type IncompleteOrders = z.output<typeof incompleteOrdersSchema>;

export const incompleteSettings = {
  'orders.incomplete': setting({
    scope: 'store',
    schema: incompleteOrdersSchema,
    default: { leftAfterMinutes: 30 }, // hardcode-ok: the shipped default, editable on Orders › Incomplete
    valueType: 'JSON',
    group: 'orders',
    labelKey: 'orders.incomplete.label',
    helpKey: 'orders.incomplete.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 240,
    version: V274,
  }),
};
