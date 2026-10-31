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
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema } from './schemas';

const V = 100;
/** PR 163's version. */
const V163 = 101;
/** PR 164's version. */
const V164 = 102;

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
};
