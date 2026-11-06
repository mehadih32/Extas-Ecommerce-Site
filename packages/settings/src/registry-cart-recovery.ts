// S13 · PR 276 (register "Abandoned-cart recovery with the offer rules"; Blueprint C6.3) — registry version 211, lane B.
//
// - `orders.cartRecovery`: a bag left by a signed-in customer (his number is on his account) who never reached the
//   checkout's number box (PR 275's ladder covers those). Off as it ships. A bag with no account and no number can only
//   be reached on the site (the bag stays in his browser) and by ad retargeting — Blueprint C6.3's "honest limit".
//   - `enabled`: the switch; nothing goes to any customer while it is off.
//   - `firstAfterMinutes`: minutes after the bag's last change before the reminder (with the link that puts it back).
//   - `channels`: the ways to try, in order; the first one he said yes to offers on is used (never one he refused).
//   - `minBagMinor`: a bag worth less than this (bag prices, in paisa) gets no reminder; 0 = any bag.
//   - `catchUpHours`: a bag left longer ago than this past its time gets no first message (switching on never messages
//     old bags).
//   - `creditDays`: an order he places within these days of a message counts as the bag coming back.
//   - `offer`: the second and last message, with the owner's code, under the offer rules — only while its own switch is
//     on and the owner picked a live code; `afterHours` after the reminder; only for a bag worth `minBagMinor` or more;
//     at most one recovery offer per customer in `oncePerDays` (from either ladder: so nobody learns to leave a bag for
//     a code); and only when the code itself may be used by him now (the rules engine's own coupon check: its dates,
//     uses, per-customer cap, who it is for and its rule live).
// One ladder per number: the number's gap is `orders.followUp.phoneGapDays` (either ladder counts). The ceiling is two
// messages per bag, ever (`FOLLOW_UP_CEILING`).
import { z } from 'zod';
import { setting } from './define';
import { FOLLOW_UP_CHANNELS } from './registry-follow-up';

const V276 = 211;

/** The largest bag worth a rule may ask for (paisa): ten lakh taka. */
const MAX_BAG_MINOR = 100_000_000;

export const cartRecoverySchema = z
  .object({
    enabled: z.boolean(),
    firstAfterMinutes: z.number().int().min(30).max(2_880),
    channels: z
      .array(z.enum(FOLLOW_UP_CHANNELS))
      .min(1)
      .max(FOLLOW_UP_CHANNELS.length)
      .refine((a) => new Set(a).size === a.length, { message: 'each channel once' }),
    minBagMinor: z.number().int().min(0).max(MAX_BAG_MINOR),
    catchUpHours: z.number().int().min(1).max(168),
    creditDays: z.number().int().min(1).max(30),
    offer: z
      .object({
        enabled: z.boolean(),
        afterHours: z.number().int().min(1).max(168),
        /** The code offered (a live coupon of the shop's, picked by the owner); '' = none. */
        couponCode: z.string().trim().max(40),
        /** Only a bag worth this much or more gets the offer (paisa); 0 = any bag the reminder went to. */
        minBagMinor: z.number().int().min(0).max(MAX_BAG_MINOR),
        /** At most one recovery offer per customer in these days (either ladder). */
        oncePerDays: z.number().int().min(1).max(365),
      })
      .strict(),
  })
  .strict();
export type CartRecoverySettings = z.output<typeof cartRecoverySchema>;

export const cartRecoverySettings = {
  'orders.cartRecovery': setting({
    scope: 'store',
    schema: cartRecoverySchema,
    // hardcode-ok: the shipped default (off), every number editable on Orders › Incomplete
    default: { enabled: false, firstAfterMinutes: 120, channels: ['WHATSAPP', 'SMS'], minBagMinor: 0, catchUpHours: 24, creditDays: 7, offer: { enabled: false, afterHours: 24, couponCode: '', minBagMinor: 0, oncePerDays: 30 } },
    valueType: 'JSON',
    group: 'orders',
    labelKey: 'orders.cartRecovery.label',
    helpKey: 'orders.cartRecovery.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 242,
    version: V276,
  }),
};
