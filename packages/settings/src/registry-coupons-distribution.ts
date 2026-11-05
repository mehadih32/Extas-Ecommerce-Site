// S13 · PR 272 (register "Coupon distribution, limits, and per-customer caps"; SIM-F-009) — how coupon codes reach
// people, on Marketing › Smart Rules › a rule's Coupons (registry version 177, lane B's free run).
//
// - `rules.coupons.distribution`: both parts off as it ships.
//   - `links`: a code in a link (`/bag?code=EID`) is put into the customer's bag when he opens it — the same check as
//     typing it (who may use it, limits, first order), so a guest from a Facebook post gets the public code.
//   - `batches`: "Make single-use codes" — a batch of codes, each usable once and once per customer, for SMS, WhatsApp
//     or printed cards; downloaded as a CSV. `batchMax` is the most codes one batch may make, `randomLength` the
//     length of each code's random part. Codes are made off; switching a batch on is the owner's OK (rules.approve).
// Nothing here sets an amount: the discount is the rule's, the limits are each coupon's.
import { z } from 'zod';
import { setting } from './define';

const V272 = 177;
/** The most codes one batch may make (a technical bound on one request). */
export const COUPON_BATCH_MAX = 5000; // hardcode-ok: technical bound on one request

export const couponDistributionSchema = z
  .object({
    /** A code in a link is put into the bag. */
    links: z.boolean(),
    /** Batches of single-use codes can be made. */
    batches: z.boolean(),
    /** The most codes one batch may make. */
    batchMax: z.number().int().min(1).max(COUPON_BATCH_MAX),
    /** Characters in each code's random part (after the prefix). */
    randomLength: z.number().int().min(6).max(16),
  })
  .strict();
export type CouponDistribution = z.output<typeof couponDistributionSchema>;

export const couponDistributionSettings = {
  'rules.coupons.distribution': setting({
    scope: 'store',
    schema: couponDistributionSchema,
    default: { links: false, batches: false, batchMax: 500, randomLength: 8 }, // hardcode-ok: the shipped defaults (off)
    valueType: 'JSON',
    group: 'rules',
    labelKey: 'rules.coupons.distribution.label',
    helpKey: 'rules.coupons.distribution.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 121,
    version: V272,
  }),
};
