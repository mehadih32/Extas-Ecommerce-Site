// S06 after launch (CN-031 lane A, registry versions 100–109). Labels: messages/risk.<lang>.json (the Orders group; the
// admin's place is Orders → Risk rules, ORD-06 of docs/BACKEND-ARCHITECTURE.md §5.3).
//
// PR 162 (`risk.blocklist`): a person (owner, manager or customer-facing staff with `risk.block`, answer 3 as the
// register records it) lists a phone number with a reason; "Undo" (`risk.unblock`) keeps the row with who, when and why.
// While this switch is on, a new order from a listed number, or from the identity it belonged to, is marked on the
// team's screens ("mark"), or held with the owner's hold reason for a person to decide ("hold"). The order is never
// cancelled and the customer is never told: a person decides (CLAUDE.md rule 6). Off as shipped.
//
// PR 163 (`risk.refusers`, version 101): repeat refusers, reversible by hand (answer 5). The owner sets how many refusals
// (not our fault) put a number on the "Repeat refusers" list (empty until he sets it: the list shows nothing), and
// chooses per case what that number's new orders get — nothing, the delivery charge first, the full amount first, or no
// cash on delivery (`risk.refuser.terms`). While this switch is on, a new order from the number carries the terms as a
// proposal on the order ("Request advance", PR 542): a person sends it, unless the owner turned on that request's own auto
// option. Nothing here changes COD by itself; "End" undoes the terms with a reason. Off as shipped.
//
// PR 164 (`risk.report`, version 102): the fraud report on Reports › Fraud & RTO — how many days it shows when no dates
// are picked, and the most orders and returned parcels one report reads (past it the page says it is cut short). A
// report only reads; nothing here blocks anyone, cancels an order or moves money.
//
// PR 522 (`risk.bundling`, version 103): several open orders of one person (the same identity or number) to the same
// address within the owner's window go in one parcel (an order group with a note) instead of one parcel each. "propose"
// (as shipped) marks the newest order for a person to press "One parcel"; "group" groups them by itself. Each order
// keeps its lines, prices, charges and payments; nothing is cancelled or blocked. The window is empty until the owner
// sets it (nothing happens until then). Off as shipped.
//
// PR 523 (`risk.blockProposal`, version 104): the proposal that fills the blocklist. When a new order lands from a
// person (the number, or the same identity under other numbers) with at least the owner's number of rejections —
// parcels refused at the door (not the shop's fault, never a try-on) plus orders cancelled with one of the owner's
// cancel codes — the number is *proposed* for the blocklist with what we know (the names and addresses given, every
// product ordered with its date). A person blocks it or says "not now" with a reason; nothing is ever blocked by
// itself, the order is never held or cancelled. The number is empty until the owner sets it. Off as shipped.
//
// PR 524 (`risk.goodCustomer`, version 105; `risk.stopReport`, version 106): false-positive protection. A good customer
// (at least the owner's number of delivered orders and at most his number of refusals, counted as the phone history
// counts them) is never held by the engine by itself: the duplicate check's automatic hold, a risk level's hold and its
// automatic advance request are skipped and written on the order as "good customer" (a review still opens for a person). Off, and the number unset,
// as shipped. The stop report (Reports › Stopped by the engine) lists every order the engine stopped in the last `days`
// days (a week as shipped) with its rule, how sure the rule was and what became of the order; a rule whose stopped
// orders were delivered all the same at least `warnWrongPercent` of the time (over at least `minStops` stops) is
// flagged, so a wrong rule is caught within days. The report only reads.
//
// PR 540 (`risk.approval`, version 107): the approval digest and the permission gate. The digest (Orders ›
// Today's digest) reports a day's orders — how many moved on, are waiting, were held (by reason), cancelled (by
// reason), have another order running and how many of those are duplicates — and lists what waits for a person's OK.
// The gate (`gate`, off as shipped): when on, the engine acts on nothing by itself — the duplicate check's, a risk
// level's and the blocklist's holds become proposed holds a person holds or lets go, "one parcel by itself" stays a
// proposal, and no advance is asked by itself — whatever those switches say. `maxRows`: the most rows each waiting
// list shows.
//
// PR 543 (`risk.learning`, version 108): the decision learning loop. Every decision a person takes on what the engine
// stopped or proposed — a review approved, declined, held or asked; a proposed hold held or let go; a blocklist proposal
// blocked or not — is kept with its note (FraudDecision, always, as the decision log). When on (`enabled`, off as shipped),
// Reports › Decisions & learning reads the last `days` days of them (at most `maxRows`): per rule and per person how
// often people let the engine's stop go or kept it, and how the orders let go ended; a rule decided at least
// `minDecisions` times that people let go (or kept) at least `suggestPercent` of the time gets a suggestion for the
// owner, and an open review shows what people did with ones like it. It suggests only: no rule changes by itself.
import { z } from 'zod';
import { setting } from './define';
import { ORDER_CANCEL_CODES } from './registry-orders';
import { dictionaryKeySchema } from './schemas';

const V = 100;
/** PR 163's version. */
const V163 = 101;
/** PR 164's version. */
const V164 = 102;
/** PR 522's version. */
const V522 = 103;
/** PR 523's version. */
const V523 = 104;
/** PR 524's versions. */
const V524 = 105;
const V524R = 106;
/** PR 540's version. */
const V540 = 107;
/** PR 543's version. */
const V543 = 108;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** What a listed number's new order gets: a mark for the team, or a hold until a person decides. */
export const RISK_BLOCKLIST_EFFECTS = ['mark', 'hold'] as const;
export type RiskBlocklistEffect = (typeof RISK_BLOCKLIST_EFFECTS)[number];

/** The shortest reason a person may give (a word or two is not a reason the next person can act on). */
export const RISK_BLOCK_REASON_LIMITS = { min: 5, max: 500 } as const;

export const riskBlocklistSchema = z
  .object({
    /** A listed number's new order is marked or held (off: the list is kept, nothing happens to orders). */
    enabled: z.boolean(),
    onOrder: z.enum(RISK_BLOCKLIST_EFFECTS),
    /** The owner's hold reason (Orders › Hold reasons) a "hold" uses. */
    holdReasonKey: dictionaryKeySchema,
  })
  .strict();
export type RiskBlocklist = z.output<typeof riskBlocklistSchema>;
export const RISK_BLOCKLIST_DEFAULT: RiskBlocklist = { enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' };

/** What the owner can choose for a repeat refuser (the advance request's kinds; `none` records "nothing"). */
export const REFUSER_TERMS = ['none', 'delivery', 'full', 'codOff'] as const;
export type RefuserTerms = (typeof REFUSER_TERMS)[number];

export const riskRefusersSchema = z
  .object({
    /** A number's chosen terms reach its new orders as a proposal (off: the list and the terms are kept, orders untouched). */
    enabled: z.boolean(),
    /** Refusals (not our fault) that put a number on the list; null until the owner sets it (the list shows nothing). */
    minRefused: z.int().min(1).max(100).nullable(),
  })
  .strict();
export type RiskRefusers = z.output<typeof riskRefusersSchema>;
export const RISK_REFUSERS_DEFAULT: RiskRefusers = { enabled: false, minRefused: null };

export const riskReportSchema = z
  .object({
    /** The days the fraud report shows when no dates are picked, today included. */
    days: z.int().min(1).max(366),
    /**
     * The most orders, and the most returned parcels, one report reads; past it the report says it is cut short. At most
     * 20,000, so one report's look-ups stay inside the database's limit of values per query.
     */
    maxRows: z.int().min(100).max(20_000),
  })
  .strict();
export type RiskReport = z.output<typeof riskReportSchema>;
export const RISK_REPORT_DEFAULT: RiskReport = { days: 30, maxRows: 5_000 };

/** What a match does: a proposal on the order for a person, or the group made by itself. */
export const RISK_BUNDLING_ACTIONS = ['propose', 'group'] as const;
export type RiskBundlingAction = (typeof RISK_BUNDLING_ACTIONS)[number];

export const riskBundlingSchema = z
  .object({
    /** A new order looks for the same person's other open orders to the same address (off: nothing is looked for). */
    enabled: z.boolean(),
    /** How many hours back an earlier order still joins; null until the owner sets it (nothing happens until then). */
    windowHours: z.int().min(1).max(168).nullable(),
    action: z.enum(RISK_BUNDLING_ACTIONS),
    /** The most orders in one parcel. */
    maxOrders: z.int().min(2).max(20),
  })
  .strict();
export type RiskBundling = z.output<typeof riskBundlingSchema>;
export const RISK_BUNDLING_DEFAULT: RiskBundling = { enabled: false, windowHours: null, action: 'propose', maxOrders: 5 };

/** The cancel codes that may count as a rejection ("the phone's owner never ordered" never counts: someone else used it). */
export const BLOCK_PROPOSAL_CANCEL_CODES = ORDER_CANCEL_CODES.filter((c) => c !== 'NOT_ORDERED');

export const riskBlockProposalSchema = z
  .object({
    /** A new order from a person with enough rejections proposes the number for the blocklist (off: nothing is proposed). */
    enabled: z.boolean(),
    /** Rejections (refused parcels plus counted cancels) that propose a number; null until the owner sets it. */
    minRejections: z.int().min(1).max(50).nullable(),
    /** The cancel codes that count as a rejection (the team declined the order); refused parcels always count. */
    cancelCodes: z
      .array(z.enum(ORDER_CANCEL_CODES).refine((c) => c !== 'NOT_ORDERED', { message: 'never a rejection' }))
      .max(BLOCK_PROPOSAL_CANCEL_CODES.length)
      .refine((l) => new Set(l).size === l.length, { message: 'every code once' }),
  })
  .strict();
export type RiskBlockProposal = z.output<typeof riskBlockProposalSchema>;
export const RISK_BLOCK_PROPOSAL_DEFAULT: RiskBlockProposal = { enabled: false, minRejections: null, cancelCodes: ['RISK_DECLINED'] };

export const riskGoodCustomerSchema = z
  .object({
    /** A good customer's new order is never held by the engine by itself (off: every rule acts as it is set). */
    enabled: z.boolean(),
    /** Delivered orders that make a good customer; null until the owner sets it (nobody counts as one until then). */
    minDelivered: z.int().min(1).max(100).nullable(),
    /** The most refusals (not our fault) a good customer may have. */
    maxRefused: z.int().min(0).max(20),
  })
  .strict();
export type RiskGoodCustomer = z.output<typeof riskGoodCustomerSchema>;
export const RISK_GOOD_CUSTOMER_DEFAULT: RiskGoodCustomer = { enabled: false, minDelivered: null, maxRefused: 0 };

export const riskStopReportSchema = z
  .object({
    /** The days the stop report shows, today included (a week as shipped). */
    days: z.int().min(1).max(92),
    /** A rule is flagged when this share (%) of its stopped orders were delivered all the same; null: never flagged. */
    warnWrongPercent: z.int().min(1).max(100).nullable(),
    /** The fewest stops (that reached an end) before a rule can be flagged. */
    minStops: z.int().min(1).max(1000),
    /** The most stopped orders one report lists. */
    maxRows: z.int().min(10).max(5000),
  })
  .strict();
export type RiskStopReport = z.output<typeof riskStopReportSchema>;
export const RISK_STOP_REPORT_DEFAULT: RiskStopReport = { days: 7, warnWrongPercent: null, minStops: 5, maxRows: 500 };

export const riskApprovalSchema = z
  .object({
    /** The engine acts on nothing by itself: its holds, its "one parcel by itself" and its advance requests wait for a person. */
    gate: z.boolean(),
    /** The most rows each waiting list of the digest shows. */
    maxRows: z.int().min(10).max(500),
  })
  .strict();
export type RiskApproval = z.output<typeof riskApprovalSchema>;
export const RISK_APPROVAL_DEFAULT: RiskApproval = { gate: false, maxRows: 100 };

export const riskLearningSchema = z
  .object({
    /** The learning reads the decisions: the report's figures and suggestions, and the line on an open review. */
    enabled: z.boolean(),
    /** How many days of decisions it reads, today included. */
    days: z.int().min(7).max(366),
    /** The fewest decisions on one rule before it says anything about that rule. */
    minDecisions: z.int().min(3).max(1000),
    /** A rule people let go (or kept) at least this share of the time gets a suggestion. */
    suggestPercent: z.int().min(50).max(100),
    /** The most decisions one report reads (the newest first). */
    maxRows: z.int().min(100).max(20_000),
  })
  .strict();
export type RiskLearning = z.output<typeof riskLearningSchema>;
export const RISK_LEARNING_DEFAULT: RiskLearning = { enabled: false, days: 90, minDecisions: 10, suggestPercent: 80, maxRows: 5000 }; // hardcode-ok: registry default (the owner changes it in the learning card)

export const riskS06Settings = {
  'risk.blocklist': setting({
    ...base,
    schema: riskBlocklistSchema,
    default: RISK_BLOCKLIST_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.blocklist.label',
    helpKey: 'risk.blocklist.help',
    sortOrder: 330,
  }),
  'risk.refusers': setting({
    ...base,
    version: V163,
    schema: riskRefusersSchema,
    default: RISK_REFUSERS_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.refusers.label',
    helpKey: 'risk.refusers.help',
    sortOrder: 331,
  }),
  'risk.report': setting({
    ...base,
    version: V164,
    schema: riskReportSchema,
    default: RISK_REPORT_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.report.label',
    helpKey: 'risk.report.help',
    sortOrder: 332,
  }),
  'risk.bundling': setting({
    ...base,
    version: V522,
    schema: riskBundlingSchema,
    default: RISK_BUNDLING_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.bundling.label',
    helpKey: 'risk.bundling.help',
    sortOrder: 333,
  }),
  'risk.blockProposal': setting({
    ...base,
    version: V523,
    schema: riskBlockProposalSchema,
    default: RISK_BLOCK_PROPOSAL_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.blockProposal.label',
    helpKey: 'risk.blockProposal.help',
    sortOrder: 334,
  }),
  'risk.goodCustomer': setting({
    ...base,
    version: V524,
    schema: riskGoodCustomerSchema,
    default: RISK_GOOD_CUSTOMER_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.goodCustomer.label',
    helpKey: 'risk.goodCustomer.help',
    sortOrder: 335,
  }),
  'risk.stopReport': setting({
    ...base,
    version: V524R,
    schema: riskStopReportSchema,
    default: RISK_STOP_REPORT_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.stopReport.label',
    helpKey: 'risk.stopReport.help',
    sortOrder: 336,
  }),
  'risk.approval': setting({
    ...base,
    version: V540,
    schema: riskApprovalSchema,
    default: RISK_APPROVAL_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.approval.label',
    helpKey: 'risk.approval.help',
    sortOrder: 337,
  }),
  'risk.learning': setting({
    ...base,
    version: V543,
    schema: riskLearningSchema,
    default: RISK_LEARNING_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.learning.label',
    helpKey: 'risk.learning.help',
    sortOrder: 338,
  }),
};
