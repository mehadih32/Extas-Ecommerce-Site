// S05 · PR 541 — the risk-sectioned order dashboard (registry version 46). Labels: messages/risk.<lang>.json (the Orders
// group; the admin's place is Orders → All orders, ORD-01, and the review queue ORD-03 of docs/BACKEND-ARCHITECTURE.md
// §5.3).
//
// The moment an order lands it is placed in ONE section, with a note on its timeline: a possible duplicate (PR 145's
// open review), a re-order while another is open or on its way, a new identity (the same person under another number,
// SIM-F-015), a high band, a band to watch, prepaid (never in the call queue, SIM-F-020), or clear. Marking is instant;
// the decision never is: a section in `review` only waits for a person (an open review, so it is neither confirmed nor
// booked before someone decides, SIM-F-014). Nothing here cancels, blocks, holds, asks for an advance or changes COD,
// a price or a charge (CLAUDE.md rule 6; R5 of the architecture).
import { z } from 'zod';
import { setting } from './define';
import { RISK_SIGNAL_KEYS, type RiskSignalKey } from './registry-risk';
import { dictionaryKeySchema } from './schemas';

const V = 46;

/** Every section an order can be in, in the order they are tried (the first that applies wins). */
export const RISK_SECTIONS = ['duplicate', 'reorder', 'identity', 'high', 'watch', 'prepaid', 'clear'] as const;
export type RiskSection = (typeof RISK_SECTIONS)[number];

/** The sections whose orders may wait for a person's decision (a duplicate always has PR 145's own review). */
export const RISK_REVIEW_SECTIONS = ['reorder', 'identity', 'high', 'watch'] as const satisfies readonly RiskSection[];
export type RiskReviewSection = (typeof RISK_REVIEW_SECTIONS)[number];

const unique = <T>(l: readonly T[]) => new Set(l).size === l.length;
const signalKeys = z
  .array(z.enum(RISK_SIGNAL_KEYS as [RiskSignalKey, ...RiskSignalKey[]]))
  .max(RISK_SIGNAL_KEYS.length)
  .refine(unique, { message: 'every signal once' });

/**
 * `enabled`: every new order is placed in its section the moment it lands (and again when its score is worked out again).
 * `review`: the sections whose orders wait for a person before they are confirmed or booked (only scored orders can be
 * in them). `highBands` / `watchBands`: the bands (keys of `risk.bands`) that make "high risk" and "watch".
 * `reorderSignals` / `identitySignals`: the signals that put an order in "re-order" and "new identity".
 */
export const riskSectionsSchema = z
  .object({
    enabled: z.boolean(),
    review: z.array(z.enum(RISK_REVIEW_SECTIONS)).max(RISK_REVIEW_SECTIONS.length).refine(unique, { message: 'every section once' }),
    highBands: z.array(dictionaryKeySchema).max(10).refine(unique, { message: 'every band once' }),
    watchBands: z.array(dictionaryKeySchema).max(10).refine(unique, { message: 'every band once' }),
    reorderSignals: signalKeys,
    identitySignals: signalKeys,
  })
  .strict()
  .refine((v) => !v.highBands.some((b) => v.watchBands.includes(b)), { message: 'a band is either high or watch, not both' });
export type RiskSections = z.output<typeof riskSectionsSchema>;

export const riskMoreSettings = {
  // The demo V12.3 ORD-03 sections; review waits only for the strong ones. Nothing is scored until the owner switches
  // `risk.score` on, so before that an order is only a duplicate (PR 145), prepaid or clear.
  'risk.sections': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V,
    schema: riskSectionsSchema,
    default: { enabled: true, review: ['reorder', 'identity', 'high'], highBands: ['high'], watchBands: ['medium'], reorderSignals: ['recentOrder', 'inTransit'], identitySignals: ['identityMatch'] },
    valueType: 'JSON',
    labelKey: 'risk.sections.label',
    helpKey: 'risk.sections.help',
    sortOrder: 340,
  }),
};
