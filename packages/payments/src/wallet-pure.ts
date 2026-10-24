// PR 171 — the wallet without a database (Blueprint B3.5; BACKEND-ARCHITECTURE §6.5.4 fact 4b, §7.7; SIM-F-054). The
// wallet is a ledger: every credit and debit is one entry, the balance follows from them, and a correction is a new
// entry the other way (never an edit; WalletEntry is append-only at the database). The service (wallet.ts) asks these
// functions before it writes anything; the screens may use them too (`@extas/payments/pure`).
import type { Value } from '@extas/settings';

/** The wallet status that holds and spends credit (the checkout reads the same word, @extas/checkout WALLET_ACTIVE). */
export const WALLET_ACTIVE = 'ACTIVE';

/**
 * Why an entry was written (`WalletEntry.reason`). Fixed codes, so reports can count them:
 * ORDER (the checkout spent it), REVIEW_REWARD (PR 65), EXCHANGE_CREDIT (S08, B1.8: only after the old item passed
 * check), REFUND (PR 172), APOLOGY (CN-018 #8), MANUAL_CREDIT / MANUAL_DEBIT (a person, with a note), OFFER (credit the
 * owner issues), CORRECTION (the reversal of an earlier entry).
 */
export const WALLET_REASONS = ['ORDER', 'REVIEW_REWARD', 'EXCHANGE_CREDIT', 'REFUND', 'APOLOGY', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'OFFER', 'CORRECTION'] as const;
export type WalletReason = (typeof WALLET_REASONS)[number];

/** Entries a person may put right with a reversal. Money spent on an order or refunded goes back through a refund. */
export const REVERSIBLE_REASONS: ReadonlySet<string> = new Set(['REVIEW_REWARD', 'APOLOGY', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'OFFER']);

export type Direction = 'CREDIT' | 'DEBIT';

/** The balance a list of entries gives (credits less debits). */
export function ledgerBalance(entries: readonly { direction: Direction; amountMinor: number }[]): number {
  let balance = 0;
  for (const e of entries) balance = e.direction === 'CREDIT' ? balance + e.amountMinor : balance - e.amountMinor;
  return balance;
}

/** The balance after one more entry, or null when a debit would take the wallet below zero. */
export function nextBalance(balanceMinor: number, direction: Direction, amountMinor: number): number | null {
  const after = direction === 'CREDIT' ? balanceMinor + amountMinor : balanceMinor - amountMinor;
  return after < 0 ? null : after;
}

/** The other direction (a reversal). */
export const opposite = (d: Direction): Direction => (d === 'CREDIT' ? 'DEBIT' : 'CREDIT');

// ---------------------------------------------------------------------------------------------------------------------
// The late-delivery apology credit (CN-018 #8)
// ---------------------------------------------------------------------------------------------------------------------

const HOUR_MS = 3_600_000;

/**
 * How many hours later than its promise the order came (or, still on its way, is by `now`): the promise is the band's
 * `hoursMax` from when it was placed (the same promise the tracking page shows, PR 135). Null: no promise to keep.
 */
export function lateHoursOf(o: { placedAt: Date; deliveredAt: Date | null; hoursMax: number | null | undefined }, now: Date): number | null {
  if (o.hoursMax == null || o.hoursMax <= 0) return null;
  const due = o.placedAt.getTime() + o.hoursMax * HOUR_MS;
  const at = (o.deliveredAt ?? now).getTime();
  return Math.max(0, Math.floor((at - due) / HOUR_MS));
}

/** Whether the order came later than its promise (any late hour counts; the rule may ask for more). */
export const isLate = (lateHours: number | null, afterHours: number): boolean => lateHours !== null && lateHours > 0 && lateHours >= afterHours;

export type ApologyRule = Value<'payments.wallet.apology'>;

export type ApologyAmount = { ok: true; amountMinor: number; limitMinor: number } | { ok: false; code: 'NOT_CONFIGURED' | 'NOT_LATE' | 'OVER_LIMIT' | 'INVALID_INPUT' };

/** The rule's own credit for an order with these goods (null: the owner has not typed it yet). */
export function ruleCredit(rule: ApologyRule, goodsMinor: number): number | null {
  if (rule.kind === 'AMOUNT') return rule.amountMinor;
  if (rule.percent === null) return null;
  return Math.round((Math.max(0, goodsMinor) * rule.percent) / 100);
}

/**
 * The apology credit for one order. PER_ORDER: the person types it, up to the owner's limit (else the rule's credit,
 * else the order's goods). RULE: the amount is the rule's (nothing typed), only when the order came `lateAfterHours`
 * late; the limit caps it. Never more than the order's goods, never 0.
 */
export function apologyAmount(rule: ApologyRule, o: { goodsMinor: number; lateHours: number | null }, typedMinor?: number): ApologyAmount {
  const goods = Math.max(0, o.goodsMinor);
  const fromRule = ruleCredit(rule, goods);
  if (rule.mode === 'RULE') {
    if (typedMinor !== undefined) return { ok: false, code: 'INVALID_INPUT' };
    if (fromRule === null) return { ok: false, code: 'NOT_CONFIGURED' };
    if (!isLate(o.lateHours, rule.lateAfterHours)) return { ok: false, code: 'NOT_LATE' };
    const limit = Math.min(goods, rule.capMinor ?? goods);
    const amount = Math.min(fromRule, limit);
    return amount > 0 ? { ok: true, amountMinor: amount, limitMinor: limit } : { ok: false, code: 'NOT_CONFIGURED' };
  }
  const limit = Math.min(goods, rule.capMinor ?? fromRule ?? goods);
  if (typedMinor === undefined || !Number.isInteger(typedMinor) || typedMinor <= 0) return { ok: false, code: 'INVALID_INPUT' };
  if (typedMinor > limit) return { ok: false, code: 'OVER_LIMIT' };
  return { ok: true, amountMinor: typedMinor, limitMinor: limit };
}
