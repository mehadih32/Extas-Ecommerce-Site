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
// PR 172 (`payments.refunds`): the rules for when a refund may be asked and how it goes back. B3.6: no refunds after the
// customer received the goods — exchange is the post-delivery route — except the sources the owner lists (the rider's
// overcharge, CN-018 #7, by default). Whether real money may go back to the wallet as store credit instead (off: the
// way it came). An RTO of a prepaid parcel (SIM-F-041) gives everything back, or keeps the delivery charge when the
// owner says so; a delivery-charge advance is kept unless he says to ask it back (review R3 M3, v141). Four eyes
// (off): the person who asked a refund may not approve it. Every refund still needs the approval of someone with the
// "approve refunds" permission (the owner; CLAUDE.md rule 6), and money back by bKash or the bank is sent by a person,
// never by the shop itself.
//
// PR 173 (`payments.partial`): partial payment — a pre-order's advance asked online now, the rest at the door. Off by
// default. The cap (§59 answer 29: a percentage, 10% by default) is the most the shop may ask as an advance, of the
// order's total; the smallest advance worth a payment session (empty: none); whether the customer may pay the whole
// order in advance instead (off). Asking an advance moves no money: the customer pays it through the gateway, and only
// money that came in lowers what the rider collects.
//
// PR 174 (`payments.statement`, `payments.statement.reasons`): the payment gateways' statements (bKash, Nagad, card),
// read line by line from the file the gateway gives (nothing typed by hand): the column names and the words that mark
// a line as money going back (a refund or a reversal), how many paisa of difference still count as a match (0: exact),
// after how many days a paid online payment on no statement is missing (0: off), and the words of every statement
// mismatch reason (SIM-F-028: a mismatch never comes without its reason; the codes are fixed, the words are the
// owner's).
//
// Nothing here moves real money or changes a price, a charge, a discount or Cash on Delivery (CLAUDE.md rule 6): the
// wallet is store credit, and every entry is a person's action, audited.
import { z } from 'zod';
import { setting } from './define';
import { lookup, messages } from './messages';
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

/** PR 172 — the sources a person may ask a refund for by hand (CANCEL and EDIT come from the order service). */
export const REFUND_RULE_SOURCES = ['RTO', 'RIDER_OVERCHARGE', 'OUR_MISTAKE', 'OTHER'] as const;

/** PR 172 — when a refund may be asked and how it goes back (see the file header). */
export const refundRulesSchema = z
  .object({
    toWallet: z.boolean(),
    afterDelivery: z.boolean(),
    afterDeliverySources: z.array(z.enum(REFUND_RULE_SOURCES)).max(REFUND_RULE_SOURCES.length),
    rtoDeliveryCharge: z.enum(['REFUND', 'KEEP']),
    fourEyes: z.boolean(),
    /**
     * Review R3 (M3, registry v141) — a delivery-charge advance (the repeat refuser's "charge first") on a refused
     * parcel: KEEP (default, the safer one for the shop: it is not asked back by itself) or ASK (asked back like the rest,
     * still only a request a person approves). A value saved before this field existed reads as KEEP.
     */
    rtoAdvance: z.enum(['KEEP', 'ASK']).default('KEEP'),
  })
  .strict()
  .refine((v) => new Set(v.afterDeliverySources).size === v.afterDeliverySources.length, { message: 'every source once' });

/** PR 173 — partial payment and the pre-order advance, capped (see the file header). */
export const partialSchema = z
  .object({
    enabled: z.boolean(),
    capPercent: z.int().min(0).max(100),
    minMinor: moneyMinorSchema.nullable(),
    allowFull: z.boolean(),
  })
  .strict();

/** PR 174 — the reason codes of a gateway statement line, and of a paid payment no statement shows (fixed). */
export const STATEMENT_MISMATCH_CODES = ['UNKNOWN_PAYMENT', 'AMOUNT_DIFFERS', 'DOUBLE_LINE', 'NOT_PAID', 'UNKNOWN_REFUND', 'REFUND_DIFFERS', 'MISSING'] as const;

const words = z.array(z.string().trim().min(1).max(60)).max(20);

/** PR 174 — how a gateway's statement file is read, and when a difference or a missing line counts. */
export const gatewayStatementSchema = z
  .object({
    columns: z.object({ trx: words.min(1), amount: words.min(1), fee: words, date: words, type: words }).strict(),
    refundWords: words,
    toleranceMinor: z.int().min(0).max(100_000),
    missingAfterDays: z.int().min(0).max(365),
  })
  .strict();

const reasonLabel = z.string().trim().min(1).max(120);
/** PR 174 — the words of each fixed statement reason code, in both languages; every code once. */
export const statementReasonsSchema = z
  .array(z.object({ code: z.enum(STATEMENT_MISMATCH_CODES), en: reasonLabel, bn: reasonLabel }).strict())
  .length(STATEMENT_MISMATCH_CODES.length)
  .refine((v) => new Set(v.map((r) => r.code)).size === v.length, { message: 'every code once' });

function reasonText(lang: 'en' | 'bn', code: string): string {
  const v = lookup(messages[lang], `defaults.payments.statement.${code}`);
  if (!v) throw new Error(`message "defaults.payments.statement.${code}" is missing in ${lang}`);
  return v;
}

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
  'payments.refunds': setting({
    ...base,
    schema: refundRulesSchema,
    default: { toWallet: false, afterDelivery: false, afterDeliverySources: ['RIDER_OVERCHARGE'], rtoDeliveryCharge: 'REFUND', fourEyes: false, rtoAdvance: 'KEEP' },
    version: 141, // review R3 (M3): `rtoAdvance` added (the next registry version after 140)
    since: 55,
    valueType: 'JSON',
    labelKey: 'payments.refunds.label',
    helpKey: 'payments.refunds.help',
    sortOrder: 220,
  }),
  'payments.partial': setting({
    ...base,
    schema: partialSchema,
    default: { enabled: false, capPercent: 10, minMinor: null, allowFull: false }, // hardcode-ok: registry default (§59 answer 29: 10%)
    valueType: 'JSON',
    labelKey: 'payments.partial.label',
    helpKey: 'payments.partial.help',
    sortOrder: 230,
  }),
  'payments.statement': setting({
    ...base,
    schema: gatewayStatementSchema,
    default: {
      columns: {
        trx: ['trx_id', 'trxid', 'transaction_id', 'trx', 'payment_id'],
        amount: ['amount', 'paid_amount', 'transaction_amount'],
        fee: ['fee', 'charge', 'mdr', 'commission', 'gateway_fee'],
        date: ['date', 'transaction_date', 'datetime', 'time', 'created_at'],
        type: ['type', 'transaction_type', 'txn_type'],
      },
      refundWords: ['refund', 'reversal', 'reversed', 'chargeback'],
      toleranceMinor: 0,
      missingAfterDays: 0,
    },
    valueType: 'JSON',
    labelKey: 'payments.statement.label',
    helpKey: 'payments.statement.help',
    sortOrder: 240,
  }),
  'payments.statement.reasons': setting({
    ...base,
    schema: statementReasonsSchema,
    default: STATEMENT_MISMATCH_CODES.map((code) => ({ code, en: reasonText('en', code), bn: reasonText('bn', code) })),
    valueType: 'JSON',
    labelKey: 'payments.statement.reasons.label',
    helpKey: 'payments.statement.reasons.help',
    sortOrder: 250,
  }),
};
