// S06 after launch (CN-031 lane A, registry versions 100–109). Labels: messages/risk.<lang>.json (the Orders group; the
// admin's place is Orders → Risk rules, ORD-06 of docs/BACKEND-ARCHITECTURE.md §5.3).
//
// PR 162 (`risk.blocklist`): a person (owner, manager or customer-facing staff with `risk.block`, answer 3 as the
// register records it) lists a phone number with a reason; "Undo" (`risk.unblock`) keeps the row with who, when and why.
// While this switch is on, a new order from a listed number, or from the identity it belonged to, is marked on the
// team's screens ("mark"), or held with the owner's hold reason for a person to decide ("hold"). The order is never
// cancelled and the customer is never told: a person decides (CLAUDE.md rule 6). Off as shipped.
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema } from './schemas';

const V = 100;

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
};
