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
//
// S06 · PR 159 — what the checkout keeps for these checks (Blueprint B6.4, BACKEND-ARCHITECTURE §8.7): the connection's
// IP, the shop's own random device id (a first-party cookie, never a fingerprint) and, only when the customer taps
// "Share my location", a rounded GPS point. All three are cleared after `retentionDays` by the worker's purge job
// (`orders.pii.purge`), so no order keeps them longer than the owner allows.
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

/**
 * `ip` / `device`: keep the connection's IP and the device id with the order. `gpsButton`: the checkout shows "Share my
 * location" (the browser asks only after the tap). `gpsDecimals`: how finely the point is kept (3 ≈ 110 m). `gpsWaitSeconds`: how long the page waits for the phone's answer. `retentionDays`:
 * after this many days the IP, the device id and the point are cleared from the order. `purgeEveryMinutes`: how often the
 * worker clears them.
 */
export const riskCaptureSchema = z
  .object({
    ip: z.boolean(),
    device: z.boolean(),
    gpsButton: z.boolean(),
    gpsDecimals: z.int().min(2).max(5),
    gpsWaitSeconds: z.int().min(5).max(120),
    retentionDays: z.int().min(1).max(3_650),
    purgeEveryMinutes: z.int().min(5).max(1_440),
  })
  .strict();
export type RiskCapture = z.output<typeof riskCaptureSchema>;

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
    default: { enabled: true, review: ['reorder', 'identity', 'high'], highBands: ['high'], watchBands: ['medium'], reorderSignals: ['recentOrder', 'inTransit'], identitySignals: ['identityMatch', 'deviceMatch', 'ipPhones'] },
    valueType: 'JSON',
    labelKey: 'risk.sections.label',
    helpKey: 'risk.sections.help',
    sortOrder: 340,
  }),
  // PR 159: the signals' raw facts, kept only as long as the owner allows (180 days unless he changes it)
  'risk.capture': setting({
    scope: 'store',
    isOwnerData: false,
    isPublic: false,
    group: 'orders',
    version: V,
    schema: riskCaptureSchema,
    default: { ip: true, device: true, gpsButton: true, gpsDecimals: 3, gpsWaitSeconds: 20, retentionDays: 180, purgeEveryMinutes: 60 },
    valueType: 'JSON',
    labelKey: 'risk.capture.label',
    helpKey: 'risk.capture.help',
    sortOrder: 341,
  }),
};
