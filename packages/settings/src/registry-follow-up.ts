// S13 · PR 275 (register "Incomplete-order follow-up, capped at two messages"; SIM-F-026; Blueprint C6.3) — registry
// version 210, lane B.
//
// - `orders.followUp`: the follow-up ladder of an unfinished checkout (Orders › Incomplete). Off as it ships.
//   - `enabled`: the switch; nothing goes to any customer while it is off.
//   - `firstAfterMinutes`: minutes after his last typing before the first message ("your bag is kept", with the link
//     that puts the bag back).
//   - `channels`: the ways to try, in order; the first one he said yes to offers on is used (never one he refused).
//   - `minStep`: how far he must have got (typed phone `details`, typed address `delivery`, reached `payment`).
//   - `catchUpHours`: a checkout left longer ago than this past its time gets no first message (switching on after
//     weeks never messages old visits).
//   - `phoneGapDays`: a number that had a follow-up in these days gets no new one (one ladder per person, not per visit).
//   - `offer`: the second message, with a code — only while its own switch is on and the owner picked a live code;
//     `afterHours` after the first message. Without it the ladder is one message.
// The ceiling is two messages per unfinished checkout, ever (the schema cannot go above it).
import { z } from 'zod';
import { setting } from './define';

const V275 = 210;

export const FOLLOW_UP_STEPS = ['details', 'delivery', 'payment'] as const;
export type FollowUpStep = (typeof FOLLOW_UP_STEPS)[number];
/** The ways a follow-up can go (the phone's own channels: it is all we have of him). */
export const FOLLOW_UP_CHANNELS = ['WHATSAPP', 'SMS'] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];
/** Blueprint C6.3: "Maximum two messages, ever." */
export const FOLLOW_UP_CEILING = 2;

export const followUpSchema = z
  .object({
    enabled: z.boolean(),
    firstAfterMinutes: z.number().int().min(15).max(2_880),
    channels: z
      .array(z.enum(FOLLOW_UP_CHANNELS))
      .min(1)
      .max(FOLLOW_UP_CHANNELS.length)
      .refine((a) => new Set(a).size === a.length, { message: 'each channel once' }),
    minStep: z.enum(FOLLOW_UP_STEPS),
    catchUpHours: z.number().int().min(1).max(168),
    phoneGapDays: z.number().int().min(1).max(90),
    offer: z
      .object({
        enabled: z.boolean(),
        afterHours: z.number().int().min(1).max(168),
        /** The code offered (a live coupon of the shop's, picked by the owner); '' = none. */
        couponCode: z.string().trim().max(40),
      })
      .strict(),
  })
  .strict();
export type FollowUpSettings = z.output<typeof followUpSchema>;

export const followUpSettings = {
  'orders.followUp': setting({
    scope: 'store',
    schema: followUpSchema,
    // hardcode-ok: the shipped default (off), every number editable on Orders › Incomplete
    default: { enabled: false, firstAfterMinutes: 60, channels: ['WHATSAPP', 'SMS'], minStep: 'details', catchUpHours: 24, phoneGapDays: 7, offer: { enabled: false, afterHours: 24, couponCode: '' } },
    valueType: 'JSON',
    group: 'orders',
    labelKey: 'orders.followUp.label',
    helpKey: 'orders.followUp.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 241,
    version: V275,
  }),
};
