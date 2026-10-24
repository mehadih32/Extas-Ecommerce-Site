// PR 174 — a payment gateway's statement without a database (BACKEND-ARCHITECTURE §6.5.3 money status; SIM-F-028):
// the file read line by line with the owner's column names (`payments.statement`), and each line matched with our own
// record by its transaction ID — a payment line with the payment the gateway confirmed, a refund line with the refund a
// person paid out and recorded with that reference. A line that does not fit always carries its reason code; the words
// are the owner's (`payments.statement.reasons`). Nothing is changed by a mismatch: it is listed for a person to check.
import type { Value } from '@extas/settings';
import { amountMinor, parseCsv } from './cod-match';

/** Every reason a statement line (or a paid payment no statement shows) does not fit, fixed (the settings' list). */
export const STATEMENT_MISMATCHES = [
  /** A payment line for a transaction we have no payment for. */
  'UNKNOWN_PAYMENT',
  /** The line's amount is not what our payment received. */
  'AMOUNT_DIFFERS',
  /** The same payment is on a statement line already (here or in an earlier statement). */
  'DOUBLE_LINE',
  /** The gateway paid a payment we did not record as paid (money that may be lost to us: SIM-F-001). */
  'NOT_PAID',
  /** A refund line with no refund of ours paid out with that reference. */
  'UNKNOWN_REFUND',
  /** A refund line whose amount is not our refund's. */
  'REFUND_DIFFERS',
  /** A paid online payment no statement shows after the owner's days. */
  'MISSING',
] as const;
export type StatementMismatch = (typeof STATEMENT_MISMATCHES)[number];

export type GatewayStatementFormat = Value<'payments.statement'>;
export type StatementKind = 'PAYMENT' | 'REFUND';

export interface GatewayLine {
  lineNo: number;
  trxId: string;
  amountMinor: number;
  feeMinor: number | null;
  occurredAt: Date | null;
  kind: StatementKind;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

export type GatewayParse = { ok: true; lines: GatewayLine[] } | { ok: false; problems: string[] };

/**
 * A gateway's file as lines; every row that cannot be read is named (nothing is guessed). A negative amount, or a type
 * the owner's words call a refund, is money going back (REFUND, the amount kept positive).
 */
export function parseGatewayStatement(text: string, f: GatewayStatementFormat): GatewayParse {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, problems: ['the file has no lines'] };
  const head = rows[0]!.map(norm);
  const col = (names: readonly string[]) => head.findIndex((h) => names.some((n) => norm(n) === h));
  const at = { trx: col(f.columns.trx), amount: col(f.columns.amount), fee: col(f.columns.fee), date: col(f.columns.date), type: col(f.columns.type) };
  const problems: string[] = [];
  if (at.trx < 0) problems.push('no transaction ID column');
  if (at.amount < 0) problems.push('no amount column');
  if (problems.length) return { ok: false, problems };
  const refund = new Set(f.refundWords.map(norm));
  const lines: GatewayLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 1;
    const trxId = (r[at.trx] ?? '').trim();
    const amount = amountMinor(r[at.amount]);
    const fee = at.fee < 0 || (r[at.fee] ?? '').trim() === '' ? null : amountMinor(r[at.fee]);
    const rawDate = at.date < 0 ? '' : (r[at.date] ?? '').trim();
    const date = rawDate === '' ? null : new Date(rawDate);
    if (!trxId) problems.push(`line ${lineNo}: no transaction ID`);
    if (amount === null) problems.push(`line ${lineNo}: the amount is not a number`);
    if (at.fee >= 0 && (r[at.fee] ?? '').trim() !== '' && fee === null) problems.push(`line ${lineNo}: the fee is not a number`);
    if (date !== null && Number.isNaN(date.getTime())) problems.push(`line ${lineNo}: the date cannot be read`);
    const typed = at.type >= 0 && refund.has(norm(r[at.type] ?? ''));
    const kind: StatementKind = typed || (amount !== null && amount < 0) ? 'REFUND' : 'PAYMENT';
    lines.push({ lineNo, trxId, amountMinor: Math.abs(amount ?? 0), feeMinor: fee === null ? null : Math.abs(fee), occurredAt: date && !Number.isNaN(date.getTime()) ? date : null, kind });
  });
  return problems.length ? { ok: false, problems } : { ok: true, lines };
}

/** What our own records say about one line's transaction. */
export interface GatewayLineContext {
  /** Our payment with this transaction ID at this gateway (payment lines), or null. */
  payment: { status: string; amountMinor: number; receivedMinor: number | null } | null;
  /** The payment is on a statement line already. */
  alreadyOnStatement: boolean;
  /** Our refund paid out with this reference (refund lines), or null. */
  refund: { amountMinor: number } | null;
  toleranceMinor: number;
}

export interface GatewayLineMatch {
  matchStatus: 'MATCHED' | 'MISMATCH';
  reasonCode: StatementMismatch | null;
  expectedMinor: number | null;
}

const PAID_STATES: ReadonlySet<string> = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);

/** One line against our records (see the file header). The first reason that applies is the reason. */
export function matchGatewayLine(l: GatewayLine, c: GatewayLineContext): GatewayLineMatch {
  const miss = (reasonCode: StatementMismatch, expectedMinor: number | null): GatewayLineMatch => ({ matchStatus: 'MISMATCH', reasonCode, expectedMinor });
  if (l.kind === 'REFUND') {
    if (!c.refund) return miss('UNKNOWN_REFUND', null);
    if (Math.abs(c.refund.amountMinor - l.amountMinor) > c.toleranceMinor) return miss('REFUND_DIFFERS', c.refund.amountMinor);
    return { matchStatus: 'MATCHED', reasonCode: null, expectedMinor: c.refund.amountMinor };
  }
  if (!c.payment) return miss('UNKNOWN_PAYMENT', null);
  const expected = c.payment.receivedMinor ?? c.payment.amountMinor;
  if (c.alreadyOnStatement) return miss('DOUBLE_LINE', expected);
  if (!PAID_STATES.has(c.payment.status)) return miss('NOT_PAID', c.payment.amountMinor);
  if (Math.abs(expected - l.amountMinor) > c.toleranceMinor) return miss('AMOUNT_DIFFERS', expected);
  return { matchStatus: 'MATCHED', reasonCode: null, expectedMinor: expected };
}
