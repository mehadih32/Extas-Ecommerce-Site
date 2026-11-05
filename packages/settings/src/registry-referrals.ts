// S13 · PR 273 (register "Referral programme"; SIM-F-009 referral half; Blueprint "Referral is always available but the
// owner controls on/off and timing, and it shows only in logged-in dashboards") — registry version 178, lane B.
//
// - `referrals.programme`: off as it ships.
//   - `on`, `startsOn`, `endsOn`: the programme's switch and window (whole days in the store's time zone; empty = no
//     limit). Outside it the customer sees no invite card and a typed invite code is not taken.
//   - `friendRuleKey`: the Smart Rule whose offer asks for a code (made by the owner in Marketing › Smart Rules) that a
//     friend's invite code unlocks on his first order. Empty = the programme gives the friend nothing, so codes are not
//     taken. The friend's amount is that rule's value: nothing here sets one.
//   - `rewardMinor`: what the customer who shared the code may get in his wallet once his friend's order is delivered;
//     empty = no reward. Given only by a person with the wallet permission, after a confirm.
//   - `rewardsMax`: the most rewards one customer can get (empty = no cap).
//   - `codeLength`: characters in each invite code.
import { z } from 'zod';
import { setting } from './define';
import { daySchema } from './registry-storefront';

const V273 = 178;
/** The longest invite code (a technical bound). */
export const REFERRAL_CODE_MAX = 12; // hardcode-ok: technical bound on the code's length

export const referralProgrammeSchema = z
  .object({
    /** The programme runs (inside its window). */
    on: z.boolean(),
    /** The first day it runs (empty = from now). */
    startsOn: daySchema.nullable(),
    /** The last day it runs (empty = no end). */
    endsOn: daySchema.nullable(),
    /** The key of the rule (an offer that asks for a code) a friend's code unlocks; empty = none. */
    friendRuleKey: z.string().trim().max(80),
    /** The sharer's wallet reward per delivered first order, in minor units (empty = none). */
    rewardMinor: z.number().int().min(1).nullable(),
    /** The most rewards one sharer can get (empty = no cap). */
    rewardsMax: z.number().int().min(1).nullable(),
    /** Characters in each invite code. */
    codeLength: z.number().int().min(6).max(REFERRAL_CODE_MAX),
  })
  .strict()
  .refine((v) => !v.startsOn || !v.endsOn || v.startsOn <= v.endsOn, { message: 'the first day comes before the last', path: ['endsOn'] });
export type ReferralProgramme = z.output<typeof referralProgrammeSchema>;

export const referralSettings = {
  'referrals.programme': setting({
    scope: 'store',
    schema: referralProgrammeSchema,
    default: { on: false, startsOn: null, endsOn: null, friendRuleKey: '', rewardMinor: null, rewardsMax: null, codeLength: 6 }, // hardcode-ok: the shipped defaults (off, no amount)
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.referrals.label',
    helpKey: 'marketing.referrals.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 31,
    version: V273,
  }),
};
