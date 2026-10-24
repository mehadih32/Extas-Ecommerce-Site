// S07 · PR 166 — Cash on Delivery money without a database (§6.5.5; SIM-F-001, SIM-F-005, SIM-F-028): what the rider
// should collect for each door outcome, the reason when he collected something else, how one line of a courier's COD
// statement stands against our own records (with the reason code of every mismatch: the five traps of the simulation
// plan §6.3), and the courier's CSV file read line by line with the owner's column names.
import { codToCollect, type DoorVariance, type LineMismatch, type MoneyFacts } from './pure';

/** The door outcomes with money (SIM-F-005): each its own state, never squeezed into "delivered or refused". */
export const COD_OUTCOMES = ['DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID', 'RETURNED', 'ATTEMPT_FAILED'] as const;
export type CodOutcome = (typeof COD_OUTCOMES)[number];
/** The outcomes that close a parcel's journey (a failed attempt is followed by another try). */
export const FINAL_OUTCOMES: readonly CodOutcome[] = ['DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID', 'RETURNED'];
/** The outcomes where money changes hands at the door. */
export const CASH_OUTCOMES: readonly CodOutcome[] = ['DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID'];

export interface DoorFacts extends Pick<MoneyFacts, 'paymentMethod' | 'totalMinor' | 'walletAppliedMinor' | 'paidMinor'> {
  deliveryChargeMinor: number;
  lines: { id: string; lineTotalMinor: number }[];
}

export interface DoorExpectation {
  /** Cash for the goods the rider should collect. */
  expectedMinor: number;
  /** The delivery charge the rider should collect (a return with the charge paid, B1.17). */
  expectedChargeMinor: number;
}

const NONE = 0;
const owed = (expectedMinor: number, expectedChargeMinor = NONE): DoorExpectation => ({ expectedMinor, expectedChargeMinor });

/**
 * What the rider should collect for an outcome. Never more than the amount due: a paid customer is never asked again
 * (SIM-F-001). A partial delivery collects the kept pieces' share of the goods (pro rata to the line totals, after every
 * discount) plus the delivery charge, less what is already paid; the owner's set-split price rule (P5) replaces the
 * pro-rata share when it comes (follow-up 330).
 */
export function doorExpectation(outcome: CodOutcome, f: DoorFacts, keptItemIds: readonly string[] = []): DoorExpectation {
  const due = codToCollect(f);
  switch (outcome) {
    case 'DELIVERED':
      return owed(due);
    case 'PARTIAL': {
      if (due === NONE) return owed(NONE);
      const lineSum = f.lines.reduce((s, l) => s + l.lineTotalMinor, 0);
      const kept = f.lines.filter((l) => keptItemIds.includes(l.id)).reduce((s, l) => s + l.lineTotalMinor, 0);
      const goods = Math.max(0, f.totalMinor - f.deliveryChargeMinor);
      const value = (lineSum > 0 ? Math.round((goods * kept) / lineSum) : 0) + f.deliveryChargeMinor;
      return owed(Math.min(due, Math.max(0, value - f.walletAppliedMinor - f.paidMinor)));
    }
    case 'RETURNED_CHARGE_PAID':
      return owed(NONE, Math.min(due, f.deliveryChargeMinor));
    default:
      return owed(NONE);
  }
}

/**
 * The reason of a door record (SIM-F-028: a difference is never silent): money taken on a paid order, more or less than
 * expected (cash or charge), or — when the money is right — why it differs from the order's amount due (a partial
 * delivery, a return with the charge paid). Null when the rider collected exactly the amount due.
 */
export function doorVariance(outcome: CodOutcome, exp: DoorExpectation, got: { collectedMinor: number; chargeCollectedMinor: number }, dueMinor: number, toleranceMinor: number): DoorVariance | null {
  if (dueMinor === 0 && got.collectedMinor + got.chargeCollectedMinor > 0) return 'PAID_ORDER_COLLECTED';
  const cash = got.collectedMinor - exp.expectedMinor;
  const charge = got.chargeCollectedMinor - exp.expectedChargeMinor;
  if (cash > toleranceMinor || charge > toleranceMinor) return 'OVER_COLLECTED';
  if (cash < -toleranceMinor || charge < -toleranceMinor) return 'SHORT_COLLECTED';
  if (outcome === 'PARTIAL') return 'PARTIAL_DELIVERY';
  if (outcome === 'RETURNED_CHARGE_PAID') return 'CHARGE_PAID_RETURN';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// A courier statement line against our records
// ---------------------------------------------------------------------------------------------------------------------

/** The courier's status word, read with the owner's word lists; anything else is OTHER. */
export type CourierStatus = 'DELIVERED' | 'PARTIAL' | 'RETURNED' | 'OTHER';

export interface StatementLine {
  lineNo: number;
  consignmentId: string;
  codMinor: number;
  chargeMinor: number;
  status: CourierStatus | null;
  rawStatus: string | null;
}

export interface LineContext {
  /** The parcel is ours (a shipment with this consignment on this courier account). */
  found: boolean;
  /** The parcel is already on another settled line (an earlier statement, or higher up in this file). */
  alreadySettled: boolean;
  /** Our last closing door record of the parcel (a rejected partial does not count), if any. */
  door: { outcome: CodOutcome; state: string; expectedMinor: number; collectedMinor: number; chargeCollectedMinor: number } | null;
  /** The COD booked on the parcel (what the rider was to collect). */
  shipmentCodMinor: number;
  /** Our record of the courier's charge for the parcel; null while it is not known (then it is not checked). */
  expectedChargeMinor: number | null;
  deliveredAt: Date | null;
  /** When the courier's money reached us. */
  receivedAt: Date;
  toleranceMinor: number;
  /** 0 = off: a settlement is never late. */
  lateAfterDays: number;
}

export interface LineMatch {
  matchState: 'MATCHED' | 'MISMATCH' | 'LATE';
  /** Always set on a MISMATCH or a LATE line; null on a MATCHED one. */
  reasonCode: LineMismatch | null;
  expectedMinor: number | null;
  expectedChargeMinor: number | null;
  /** Days from delivery to the courier's money (null without a delivery date). */
  settleDays: number | null;
}

const DAY = 86_400_000;

/** The cash we expect the courier to pay for the parcel, from our own records. */
function expectedCash(c: LineContext): number {
  const d = c.door;
  if (!d) return c.shipmentCodMinor;
  if (d.outcome === 'RETURNED_CHARGE_PAID') return d.chargeCollectedMinor;
  if (d.outcome === 'RETURNED' || d.outcome === 'ATTEMPT_FAILED') return 0;
  return d.expectedMinor;
}

/** How one statement line stands (see the file header); the first reason that applies wins. */
export function matchLine(l: StatementLine, c: LineContext): LineMatch {
  const settleDays = c.deliveredAt ? Math.max(0, Math.floor((c.receivedAt.getTime() - c.deliveredAt.getTime()) / DAY)) : null;
  const base = { expectedMinor: c.found ? expectedCash(c) : null, expectedChargeMinor: c.found ? c.expectedChargeMinor : null, settleDays };
  const no = (reasonCode: LineMismatch): LineMatch => ({ matchState: 'MISMATCH', reasonCode, ...base });
  if (!c.found) return no('UNKNOWN_PARCEL');
  if (c.alreadySettled) return no('DOUBLE_LINE');
  const d = c.door;
  // trap 1: we know the parcel came back (the customer paid only the delivery charge), the courier calls it delivered
  if (d?.outcome === 'RETURNED_CHARGE_PAID' && l.status === 'DELIVERED') return no('RETURN_AS_DELIVERED');
  // trap 2: a partial delivery we have not approved (or not heard of) — the money differs from the booked COD
  const approvedPartial = d?.outcome === 'PARTIAL' && (d.state === 'RECORDED' || d.state === 'APPROVED');
  if ((l.status === 'PARTIAL' || d?.outcome === 'PARTIAL') && !approvedPartial) return no('PARTIAL_DELIVERY');
  const tol = c.toleranceMinor;
  const want = base.expectedMinor!;
  if (want > 0 && l.codMinor === 0) return no('NOT_COLLECTED');
  if (l.codMinor < want - tol) return no('SHORT_PAID');
  if (l.codMinor > want + tol) return no('OVER_PAID');
  // trap 4: the charge deducted twice
  if (c.expectedChargeMinor !== null) {
    if (c.expectedChargeMinor > 0 && Math.abs(l.chargeMinor - 2 * c.expectedChargeMinor) <= tol) return no('DOUBLE_CHARGE');
    if (Math.abs(l.chargeMinor - c.expectedChargeMinor) > tol) return no('CHARGE_DIFFERS');
  }
  // trap 5: the money is right but came after the owner's limit
  if (c.lateAfterDays > 0 && settleDays !== null && settleDays > c.lateAfterDays) return { matchState: 'LATE', reasonCode: 'LATE_SETTLEMENT', ...base };
  return { matchState: 'MATCHED', reasonCode: null, ...base };
}

// ---------------------------------------------------------------------------------------------------------------------
// The courier's CSV file
// ---------------------------------------------------------------------------------------------------------------------

export interface StatementFormat {
  /** For each field, the header names it may have in a courier's file (compared without case, spaces or _). */
  columns: { consignment: string[]; cod: string[]; charge: string[]; status: string[] };
  /** The courier's status words for each of our states (compared the same way). */
  statusWords: { DELIVERED: string[]; PARTIAL: string[]; RETURNED: string[] };
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

/** One CSV record per line, with quoted fields ("a, b" and "" inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** An amount as the courier writes it (৳1,250.50 · Tk 1250 · ১২৫০) in minor units; null when it is not a number. */
export function amountMinor(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = [...raw.trim()].map((ch) => (BN_DIGITS.includes(ch) ? String(BN_DIGITS.indexOf(ch)) : ch)).join('').replace(/[৳,\s]|tk|bdt/gi, '');
  if (s === '') return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function courierStatus(raw: string | null, words: StatementFormat['statusWords']): CourierStatus | null {
  if (raw === null || raw.trim() === '') return null;
  const n = norm(raw);
  for (const k of ['DELIVERED', 'PARTIAL', 'RETURNED'] as const) if (words[k].some((w) => norm(w) === n)) return k;
  return 'OTHER';
}

export type StatementParse = { ok: true; lines: StatementLine[] } | { ok: false; problems: string[] };

/** The courier's file as lines; every row that cannot be read is named (nothing is guessed). */
export function parseStatement(text: string, format: StatementFormat): StatementParse {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, problems: ['the file has no lines'] };
  const head = rows[0]!.map(norm);
  const col = (names: string[]) => head.findIndex((h) => names.some((n) => norm(n) === h));
  const at = { consignment: col(format.columns.consignment), cod: col(format.columns.cod), charge: col(format.columns.charge), status: col(format.columns.status) };
  const problems: string[] = [];
  if (at.consignment < 0) problems.push('no consignment column');
  if (at.cod < 0) problems.push('no COD amount column');
  if (problems.length) return { ok: false, problems };
  const lines: StatementLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 1;
    const consignmentId = (r[at.consignment] ?? '').trim();
    const codMinor = amountMinor(r[at.cod]);
    const chargeMinor = at.charge < 0 ? 0 : amountMinor(r[at.charge]);
    if (!consignmentId) problems.push(`line ${lineNo}: no consignment`);
    if (codMinor === null || codMinor < 0) problems.push(`line ${lineNo}: the COD amount is not a number`);
    if (chargeMinor === null || chargeMinor < 0) problems.push(`line ${lineNo}: the charge is not a number`);
    const rawStatus = at.status < 0 ? null : (r[at.status] ?? '').trim() || null;
    lines.push({ lineNo, consignmentId, codMinor: codMinor ?? 0, chargeMinor: chargeMinor ?? 0, status: courierStatus(rawStatus, format.statusWords), rawStatus });
  });
  return problems.length ? { ok: false, problems } : { ok: true, lines };
}
