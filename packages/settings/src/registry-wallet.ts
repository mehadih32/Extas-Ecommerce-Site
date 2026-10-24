// S07 · the wallet, refunds, advances and the gateway statements (PR 171–174). Registry version 55. Labels:
// messages/payments.<lang>.json (the "payment" group; the admin's place is Money → Payments & refunds, MNY-03 of
// docs/BACKEND-ARCHITECTURE.md §5.11, on the new admin shell). Every key here is a new feature or a rule about money,
// so each is off (or at its safest value) until the owner sets it (CN-018).
//
// PR 171 (`payments.wallet.manual`, `payments.wallet.apology`): the wallet is a ledger (credits and debits, the balance
// follows from them; a correction is a new entry the other way, never an edit). A team member may credit or debit a
// customer's wallet by hand with a reason only while the owner has switched it on (SIM-F-054: the wallet credit tool,
// Accounts role, the owner's OK by hard rule 6), never more than his limit in one entry. The late-delivery apology
// credit (CN-018 #8): whether to give it at all, a fixed amount or a percentage of the order's goods, given by a
// person on one order (he types the amount within the limit) or by the owner's rule (the amount follows from the rule,
// only once the order came later than its promise by the owner's hours), to the wallet. The "next order" target waits
// for the coupons (PR 272, after launch) and is not offered yet.
//
// Nothing here moves real money or changes a price, a charge, a discount or Cash on Delivery (CLAUDE.md rule 6): the
// wallet is store credit, and every entry is a person's action, audited.
import { z } from 'zod';
import { setting } from './define';
import { moneyMinorSchema } from './schemas';

const V = 55;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'payment', version: V } as const;

/** PR 171 — a person's own credit or debit of a customer's wallet: the switch and the largest single entry (null: none). */
export const walletManualSchema = z.object({ enabled: z.boolean(), maxMinor: moneyMinorSchema.nullable() }).strict();

/** PR 171 (CN-018 #8) — how the apology credit is decided: by a person on one order, or by the owner's rule. */
export const APOLOGY_MODES = ['PER_ORDER', 'RULE'] as const;
/** A fixed amount, or a percentage of the order's goods. */
export const APOLOGY_KINDS = ['AMOUNT', 'PERCENT'] as const;
/** Where the credit goes. The next order (a one-time code) comes with the coupons, PR 272. */
export const APOLOGY_TARGETS = ['WALLET'] as const;

/**
 * PR 171 (CN-018 #8) — the late-delivery apology credit. `amountMinor` / `percent`: the rule's credit (AMOUNT or
 * PERCENT); `capMinor`: the most one order gets (null: no limit; in PER_ORDER mode the person types up to it, or up to
 * the rule's amount when there is no limit); `lateAfterHours`: in RULE mode, how much later than its promise the order
 * must have come (0: any time past the promise). Off by default; empty amounts until the owner types them.
 */
export const apologySchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(APOLOGY_MODES),
    kind: z.enum(APOLOGY_KINDS),
    amountMinor: moneyMinorSchema.nullable(),
    percent: z.number().min(0).max(100).nullable(),
    capMinor: moneyMinorSchema.nullable(),
    lateAfterHours: z.int().min(0).max(24 * 60),
    to: z.enum(APOLOGY_TARGETS),
  })
  .strict();

export const walletSettings = {
  'payments.wallet.manual': setting({
    ...base,
    schema: walletManualSchema,
    default: { enabled: false, maxMinor: null },
    valueType: 'JSON',
    labelKey: 'payments.wallet.manual.label',
    helpKey: 'payments.wallet.manual.help',
    sortOrder: 200,
  }),
  'payments.wallet.apology': setting({
    ...base,
    schema: apologySchema,
    default: { enabled: false, mode: 'PER_ORDER', kind: 'AMOUNT', amountMinor: null, percent: null, capMinor: null, lateAfterHours: 0, to: 'WALLET' },
    valueType: 'JSON',
    labelKey: 'payments.wallet.apology.label',
    helpKey: 'payments.wallet.apology.help',
    sortOrder: 210,
  }),
};
