// CN-028 · PR 615 (CN-029 Phase 0) — Retail's ERP account ledger (docs/RETAIL-ERP-MODEL.md §3.1): the entry kinds, which
// ERP event makes which entry and with which sign, and the hash chain that shows any change. The table is ErpAccountEntry
// (append-only at the database, migration 0049_erp_v6); these are the rules every lane writes against.
import { createHash } from 'node:crypto';
import type { ErpV6Event } from './contract-v6';

/** The kinds of entry (Prisma enum ErpAccountEntryKind, same values in the same order). */
export const ERP_ACCOUNT_ENTRY_KINDS = [
  'BILL',
  'EXCHANGE_EXTRA',
  'EXCHANGE_ADJUSTMENT',
  'EXCHANGE_BILL',
  'EXCHANGE_CREDIT',
  'RETURN_CREDIT',
  'PAYMENT',
  'SWITCH_TRANSFER',
  'REVERSAL',
  'ADJUSTMENT',
] as const;
export type ErpAccountEntryKind = (typeof ERP_ACCOUNT_ENTRY_KINDS)[number];

/** Where an entry came from (Prisma enum ErpEntrySource). */
export const ERP_ENTRY_SOURCES = ['WEBHOOK', 'PULL', 'ANSWER', 'MANUAL', 'SWITCH'] as const;
export type ErpEntrySource = (typeof ERP_ENTRY_SOURCES)[number];

/**
 * What each kind does to the balance Retail owes: +1 owes more, −1 owes less, 0 either way (a reversal is the opposite
 * of what it undoes; an adjustment and the switch transfer carry their own sign).
 */
export const ENTRY_SIGN: Readonly<Record<ErpAccountEntryKind, 1 | -1 | 0>> = {
  BILL: 1,
  EXCHANGE_EXTRA: 1,
  EXCHANGE_ADJUSTMENT: -1,
  EXCHANGE_BILL: 1,
  EXCHANGE_CREDIT: -1,
  RETURN_CREDIT: -1,
  PAYMENT: -1,
  // PR 619: the ERP's one transfer at the switch nets the customer advances it credits against the unpaid amounts it
  // moves (site-changes-v6 §3.3), so it carries its own sign.
  SWITCH_TRANSFER: 0,
  REVERSAL: 0,
  ADJUSTMENT: 0,
};

/**
 * A money column read from the database as an exact number. Every lump-sum `…Minor` column of the v6 tables is BIGINT
 * (a balance or a month's total can pass ৳2.15 crore, the INTEGER limit, in poisha); unit prices stay INTEGER. Throws
 * when the value is not a whole number inside the exact range, so a sum or a hash never silently rounds.
 */
export function minorOf(v: bigint | number): number {
  const n = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isSafeInteger(n) || (typeof v === 'bigint' && BigInt(n) !== v)) throw new RangeError('an amount left the exact range');
  return n;
}

/** Does `amountMinor` have the sign its kind asks for? (A zero amount is never an entry.) */
export function signIsRight(kind: ErpAccountEntryKind, amountMinor: number): boolean {
  if (!Number.isSafeInteger(amountMinor) || amountMinor === 0) return false;
  const want = ENTRY_SIGN[kind];
  return want === 0 || Math.sign(amountMinor) === want;
}

/**
 * The entry an ERP event makes, or null when it moves no money (§3.1): a declined piece and an exchange refusal make no
 * entry (their loss is in the P&L ledger). Any event with `reverses` is a REVERSAL of the entry it names. A BILL comes
 * from the answer to `POST /shipments` (never from an event), a SWITCH_TRANSFER from the switch, an ADJUSTMENT by hand.
 */
export function entryKindOfEvent(ev: Pick<ErpV6Event, 'type' | 'reverses' | 'data'>): ErpAccountEntryKind | null {
  if (ev.reverses) return 'REVERSAL';
  switch (ev.type) {
    case 'return.piece.decided':
      return ev.data.decision === 'APPROVED' || ev.data.decision === 'APPROVED_AT_PACKING' ? 'RETURN_CREDIT' : null;
    case 'exchange.settled':
      return ev.data.kind === 'EXTRA' ? 'EXCHANGE_EXTRA' : ev.data.kind === 'ADJUSTMENT' ? 'EXCHANGE_ADJUSTMENT' : null;
    case 'exchange.billed':
      return 'EXCHANGE_BILL';
    case 'exchange.credited':
      return 'EXCHANGE_CREDIT';
    case 'payment.recorded':
      return 'PAYMENT';
    default:
      return null;
  }
}

/** The key of an entry the shop writes itself (never an ERP eventId, never reused). */
export const entryKey = {
  /** The bill in the answer to `POST /shipments`, by consignment (the shipment call is keyed by it, §10). */
  shipment: (consignmentId: string) => `ship:${consignmentId}`,
  adjustment: (adjustmentId: string) => `adj:${adjustmentId}`,
  switchTransfer: (switchDate: string) => `switch:${switchDate}`,
} as const;

/** One entry as the ledger keeps it (the parts the hash covers). Dates are the ERP's own business date, YYYY-MM-DD. */
export interface ErpAccountEntryInput {
  seq: number;
  kind: ErpAccountEntryKind;
  eventId: string;
  businessDate: string;
  /** Signed, minor units of whole taka. */
  amountMinor: number;
  externalOrderId?: string | null;
  lineId?: string | null;
  returnListId?: string | null;
  consignmentId?: string | null;
  exchangeId?: string | null;
  paymentRef?: string | null;
  source: ErpEntrySource;
  reverses?: string | null;
}

const HASHED: readonly (keyof ErpAccountEntryInput)[] = ['seq', 'kind', 'eventId', 'businessDate', 'amountMinor', 'externalOrderId', 'lineId', 'returnListId', 'consignmentId', 'exchangeId', 'paymentRef', 'source', 'reverses'];

/** The entry as one stable line of text (fixed field order, empty parts as null). */
export function canonicalEntry(e: ErpAccountEntryInput): string {
  return JSON.stringify(HASHED.map((k) => e[k] ?? null));
}

/** The entry's hash, chained to the one before it (`prevHash` null for the first entry of a link). SHA-256, hex. */
export function chainHash(prevHash: string | null, e: ErpAccountEntryInput): string {
  return createHash('sha256').update(`${prevHash ?? ''}\n${canonicalEntry(e)}`).digest('hex');
}

/**
 * Checks a link's entries in `seq` order: 1, 2, 3 … with no gap, each hash right and chained to the one before. Returns
 * the first entry that breaks the chain (HISTORY_CHANGED), or null when the chain holds.
 */
export function brokenLink(entries: readonly (ErpAccountEntryInput & { prevHash: string | null; hash: string })[]): { seq: number; why: 'GAP' | 'PREV_HASH' | 'HASH' } | null {
  let prev: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.seq !== i + 1) return { seq: e.seq, why: 'GAP' };
    if ((e.prevHash ?? null) !== prev) return { seq: e.seq, why: 'PREV_HASH' };
    if (chainHash(prev, e) !== e.hash) return { seq: e.seq, why: 'HASH' };
    prev = e.hash;
  }
  return null;
}

/** Balance = the sum of every entry (§3.1). Exact: throws when the sum leaves the safe integer range. */
export function balanceOf(entries: readonly Pick<ErpAccountEntryInput, 'amountMinor'>[]): number {
  let sum = 0;
  for (const e of entries) {
    sum += e.amountMinor;
    if (!Number.isSafeInteger(sum)) throw new RangeError('the balance left the exact range');
  }
  return sum;
}
