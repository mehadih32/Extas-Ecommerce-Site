// S06 · a number's history and the risk score. Registry version 43 (`risk.signals` changed in v46: PR 541's signals). Labels: messages/risk.<lang>.json (the Orders
// group; the admin's place is Orders → Risk rules, ORD-06 of docs/BACKEND-ARCHITECTURE.md §5.3, built on the new
// admin shell).
//
// PR 157 (`risk.history`): what counts in a number's history — how many earlier orders are read, the refusals that are
// the shop's fault, the call outcomes that mean "did not answer". SIM-F-044: a refusal the shop caused (late after the
// promise, the wrong item, damaged, arrived after Eid, "did not order") never counts against the customer —
// `risk.history.ourFaultRefusals` lists those refusal reasons (`orders.refusal.reasons` keys).
//
// PR 156 (`risk.score`, `risk.signals`, `risk.bands`), owner's answer 1 (S06) and CN-018 (2): the owner builds the risk
// matrix — every signal (PR 158's address and zone checks among them), its weight and the thresholds of the bands are
// his settings, with sensible options. Off until he switches it on (`risk.score.enabled`): no order is scored before
// that. The score only informs: nothing here blocks anyone, holds an order, asks for an advance, turns COD off or
// changes a price or a charge (CLAUDE.md rule 6; R5 of the architecture: "no auto-blocking"). What happens at a level
// (watch, hold, a call, an advance) is PR 161's, on top of these bands.
import { z } from 'zod';
import { setting } from './define';
import { lookup, messages } from './messages';
import { ORDER_CANCEL_CODES } from './registry-orders';
import { dictionaryKeySchema, moneyMinorSchema } from './schemas';

const V = 43;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/**
 * PR 157 — what counts in a number's history (the order page's line and the score's facts). `orders`: how many of its
 * earlier orders are read, newest first. `ourFaultRefusals`: refusal reasons the shop caused — shown, never counted
 * (SIM-F-044). `noAnswerOutcomes`: the call outcomes that mean "did not answer" (the call screen's codes).
 */
export const riskHistorySchema = z
  .object({ orders: z.int().min(10).max(2_000), ourFaultRefusals: z.array(dictionaryKeySchema).max(100), noAnswerOutcomes: z.array(z.string().trim().min(1).max(60)).max(20) })
  .strict();

/** A band's starting words from `defaults.risk.bands.<key>` in messages/risk.<lang>.json. */
function bandText(lang: 'en' | 'bn', key: string): string {
  const v = lookup(messages[lang], `defaults.risk.bands.${key}`);
  if (!v) throw new Error(`risk message "defaults.risk.bands.${key}" is missing in ${lang}`);
  return v;
}
const band = (key: string, minScore: number, tone: 'ok' | 'warn' | 'bad') => ({ key, en: bandText('en', key), bn: bandText('bn', key), minScore, tone });

/** The highest weight one signal may add, and the highest score (a score is capped here). */
export const RISK_MAX = 100;

const weight = z.int().min(0).max(RISK_MAX);
const days = z.int().min(0).max(3_650);
const count = z.int().min(1).max(100);

/** Signals read from the phone's own history in the shop (PR 157): the strongest layer (Blueprint B6.4, layer 1). */
const historySignals = {
  /** Parcels refused at the door before (not our fault), at least `atLeast` in the last `windowDays` (0: ever). */
  refusals: z.object({ enabled: z.boolean(), weight, atLeast: count, windowDays: days }).strict(),
  /** Orders cancelled before with one of `codes` (never "changed after booking" or "did not order"). */
  cancels: z.object({ enabled: z.boolean(), weight, atLeast: count, windowDays: days, codes: z.array(z.enum(ORDER_CANCEL_CODES)).max(ORDER_CANCEL_CODES.length) }).strict(),
  /** Of the parcels that reached the door (delivered or refused), fewer than `belowPct` % were taken; only from `minParcels`. */
  successRatio: z.object({ enabled: z.boolean(), weight, belowPct: z.int().min(1).max(100), minParcels: count }).strict(),
  /** The first order from this number. */
  newPhone: z.object({ enabled: z.boolean(), weight }).strict(),
  /** Calls on earlier orders that went unanswered (`risk.history.noAnswerOutcomes`), at least `atLeast`. */
  noAnswer: z.object({ enabled: z.boolean(), weight, atLeast: count, windowDays: days }).strict(),
  /** Another order from this number in the `withinHours` before this one. */
  recentOrder: z.object({ enabled: z.boolean(), weight, withinHours: z.int().min(1).max(24 * 30) }).strict(),
  /** A parcel to this number is with the courier right now. */
  inTransit: z.object({ enabled: z.boolean(), weight }).strict(),
  /** The order is worth `atLeastMinor` or more (empty: never), on a first order only when `firstOrderOnly`. */
  orderValue: z.object({ enabled: z.boolean(), weight, atLeastMinor: moneyMinorSchema.nullable(), firstOrderOnly: z.boolean() }).strict(),
  /**
   * PR 541 (v46, SIM-F-015): `atLeast` pieces or more in one order (empty: never), on a first order only when
   * `firstOrderOnly` — the ৳7,400 first order of 4 panjabis at Eid. Off and empty until the owner sets it.
   */
  orderPieces: z.object({ enabled: z.boolean(), weight, atLeast: z.int().min(1).max(500).nullable(), firstOrderOnly: z.boolean() }).strict().default({ enabled: false, weight: 15, atLeast: null, firstOrderOnly: true }),
  /**
   * PR 541 (v46, SIM-F-015): the identity check beyond the phone — earlier orders under ANOTHER number with the same
   * name and an address at least `addressSimilarity` alike (pg_trgm), in the last `windowDays` (0: ever). A refusal among
   * them is named. Off until the owner switches it on.
   */
  identityMatch: z.object({ enabled: z.boolean(), weight, windowDays: days, addressSimilarity: z.number().min(0.3).max(1) }).strict().default({ enabled: false, weight: 20, windowDays: 365, addressSimilarity: 0.6 }),
  /**
   * PR 159 (v46, Blueprint B6.4): earlier orders from the same device (the shop's own random device id, `risk.capture`)
   * under ANOTHER number, in the last `windowDays` (0: ever, but never past the retention). A refusal among them is named.
   */
  deviceMatch: z.object({ enabled: z.boolean(), weight, windowDays: days }).strict().default({ enabled: false, weight: 20, windowDays: 90 }),
  /** PR 159 (v46): at least `atLeast` OTHER numbers ordered from the same connection (IP) in the `withinHours` before this one. */
  ipPhones: z.object({ enabled: z.boolean(), weight, atLeast: count, withinHours: z.int().min(1).max(24 * 30) }).strict().default({ enabled: false, weight: 15, atLeast: 3, withinHours: 24 }),
};

/** Signals read from the address against the gazetteer (PR 158). */
const addressSignals = {
  /** No place in the gazetteer settles the address (the order is "address unclear"). */
  addressUnresolved: z.object({ enabled: z.boolean(), weight }).strict(),
  /** The band is sure but the exact place is not (two places of one name). */
  addressUnsure: z.object({ enabled: z.boolean(), weight }).strict(),
  /** The line says nowhere where the house is (a landmark only, PR 563's address check). */
  addressNoDetail: z.object({ enabled: z.boolean(), weight }).strict(),
  /** The place is in another district (or `level` area) than the one this number is known by (phone-first, PR 555). */
  areaMismatch: z.object({ enabled: z.boolean(), weight, level: z.enum(['district', 'area']) }).strict(),
  /** The place is in, or under, one of the owner's places (`areaIds`, gazetteer ids; empty: none). */
  riskyArea: z.object({ enabled: z.boolean(), weight, areaIds: z.array(z.uuid()).max(500) }).strict(),
  /** At least `atLeast` parcels to the same place were refused (not our fault) in the last `windowDays` (0: ever). */
  areaRefusals: z.object({ enabled: z.boolean(), weight, atLeast: count, windowDays: days }).strict(),
};

export const riskSignalsSchema = z.object({ ...historySignals, ...addressSignals }).strict();
export type RiskSignals = z.output<typeof riskSignalsSchema>;
/** Every signal of the model, in the order the panel lists them. */
export const RISK_SIGNAL_KEYS = Object.keys(riskSignalsSchema.shape) as (keyof RiskSignals)[];
export type RiskSignalKey = (typeof RISK_SIGNAL_KEYS)[number];

const label = z.string().trim().min(1).max(60);

/**
 * The bands (the owner's thresholds, answer 1): each from its `minScore` up to the next band's. The first starts at 0;
 * the thresholds rise. `tone` is how the order page colours it (ok, warn, bad).
 */
export const riskBandsSchema = z
  .array(z.object({ key: dictionaryKeySchema, en: label, bn: label, minScore: z.int().min(0).max(RISK_MAX), tone: z.enum(['ok', 'warn', 'bad']) }).strict())
  .min(1)
  .max(10)
  .refine((l) => l[0]?.minScore === 0, { message: 'the first band starts at 0' })
  .refine((l) => l.every((b, i) => i === 0 || b.minScore > l[i - 1]!.minScore), { message: 'the thresholds must rise' })
  .refine((l) => new Set(l.map((b) => b.key)).size === l.length, { message: 'every key must be unique' });
export type RiskBands = z.output<typeof riskBandsSchema>;

/**
 * The model's switches. `enabled`: every new order is scored once when it lands (and again after an edit when
 * `afterEdit`), the score and its reasons stored on the order and its timeline. `showOnOrder`: the order page shows
 * the risk card.
 */
export const riskScoreSchema = z.object({ enabled: z.boolean(), afterEdit: z.boolean(), showOnOrder: z.boolean() }).strict();

export const riskSettings = {
  'risk.history': setting({
    ...base,
    schema: riskHistorySchema,
    default: { orders: 200, ourFaultRefusals: ['late', 'wrong-item', 'damaged', 'after-eid', 'did-not-order'], noAnswerOutcomes: ['NO_ANSWER'] },
    valueType: 'JSON',
    labelKey: 'risk.history.label',
    helpKey: 'risk.history.help',
    sortOrder: 330,
  }),
  'risk.score': setting({
    ...base,
    schema: riskScoreSchema,
    default: { enabled: false, afterEdit: true, showOnOrder: true },
    valueType: 'JSON',
    labelKey: 'risk.score.label',
    helpKey: 'risk.score.help',
    sortOrder: 300,
  }),
  // Claude's starting set (register PR 161: "Claude's set is the default"; demo V12.3 Orders → Risk rules). Signals that
  // need the owner's own value (an amount, a list of places) start off and empty.
  'risk.signals': setting({
    ...base,
    schema: riskSignalsSchema,
    default: {
      refusals: { enabled: true, weight: 30, atLeast: 1, windowDays: 0 },
      cancels: { enabled: true, weight: 15, atLeast: 2, windowDays: 90, codes: ['CUSTOMER_BEFORE_CONFIRM', 'CUSTOMER_AFTER_CONFIRM', 'ADVANCE_NOT_PAID', 'RISK_DECLINED', 'ADDRESS_UNREACHABLE'] },
      successRatio: { enabled: true, weight: 20, belowPct: 60, minParcels: 3 },
      newPhone: { enabled: true, weight: 10 },
      noAnswer: { enabled: true, weight: 15, atLeast: 1, windowDays: 0 },
      recentOrder: { enabled: true, weight: 25, withinHours: 24 },
      inTransit: { enabled: true, weight: 20 },
      orderValue: { enabled: false, weight: 15, atLeastMinor: null, firstOrderOnly: true },
      orderPieces: { enabled: false, weight: 15, atLeast: null, firstOrderOnly: true },
      identityMatch: { enabled: false, weight: 20, windowDays: 365, addressSimilarity: 0.6 },
      deviceMatch: { enabled: false, weight: 20, windowDays: 90 },
      ipPhones: { enabled: false, weight: 15, atLeast: 3, withinHours: 24 },
      addressUnresolved: { enabled: true, weight: 10 },
      addressUnsure: { enabled: true, weight: 5 },
      addressNoDetail: { enabled: true, weight: 5 },
      areaMismatch: { enabled: true, weight: 10, level: 'district' },
      riskyArea: { enabled: false, weight: 15, areaIds: [] },
      areaRefusals: { enabled: false, weight: 10, atLeast: 3, windowDays: 90 },
    },
    // PR 541 (v46) added orderPieces and identityMatch (off): an owner's stored set from v43 still reads, the new
    // signals taking their defaults (the schema's `.default`), so nothing he set is lost.
    version: 46,
    since: V,
    valueType: 'JSON',
    labelKey: 'risk.signals.label',
    helpKey: 'risk.signals.help',
    sortOrder: 310,
  }),
  // The S06 question 1 default thresholds, as the demo draws them (soft from 35, hard from 65).
  'risk.bands': setting({
    ...base,
    schema: riskBandsSchema,
    default: [band('low', 0, 'ok'), band('medium', 35, 'warn'), band('high', 65, 'bad')],
    valueType: 'JSON',
    labelKey: 'risk.bands.label',
    helpKey: 'risk.bands.help',
    sortOrder: 320,
  }),
};
