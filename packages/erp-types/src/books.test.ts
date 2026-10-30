// The owner's rules of the books (docs/RETAIL-ERP-MODEL.md §3, §4), first as tests: the ledgers tie by one formula with
// zero tolerance, a correction is a reversal plus a new entry and any change breaks the chain, fixed costs add up to
// the month exactly, the week starts on Saturday and the financial year in July by default (settings).
import { describe, expect, it } from 'vitest';
import {
  BOOKS_CHECK_LETTER,
  BOOKS_CHECKS,
  BOOKS_DIFFERENCE_CLASSES,
  BOOKS_FIX,
  balanceOf,
  brokenLink,
  canMove,
  chainHash,
  COST_LINE_PATH,
  COST_SUMMARY_LINES,
  ENTRY_SIGN,
  entryKindOfEvent,
  ERP_ACCOUNT_ENTRY_KINDS,
  ERP_LINK_REFUSALS,
  ERP_LINK_SECRET_FIELDS,
  minorOf,
  periodOf,
  pipelineValue,
  signIsRight,
  spreadByDays,
  tieRemainder,
  worstResult,
  type ErpAccountEntryInput,
} from './index';

const entry = (seq: number, kind: ErpAccountEntryInput['kind'], eventId: string, amountMinor: number, reverses: string | null = null): ErpAccountEntryInput => ({
  seq,
  kind,
  eventId,
  businessDate: '2026-10-23',
  amountMinor,
  source: 'WEBHOOK',
  reverses,
});

function chain(entries: ErpAccountEntryInput[]) {
  let prev: string | null = null;
  return entries.map((e) => {
    const hash = chainHash(prev, e);
    const row = { ...e, prevHash: prev, hash };
    prev = hash;
    return row;
  });
}

describe('the ERP account ledger (PR 615, §3.1)', () => {
  it('every kind has its sign; a declined piece and an even exchange make no entry', () => {
    expect(Object.keys(ENTRY_SIGN)).toEqual([...ERP_ACCOUNT_ENTRY_KINDS]);
    expect(signIsRight('BILL', 65000)).toBe(true);
    expect(signIsRight('BILL', -65000)).toBe(false);
    expect(signIsRight('RETURN_CREDIT', -65000)).toBe(true);
    expect(signIsRight('PAYMENT', 100)).toBe(false);
    expect(signIsRight('REVERSAL', 65000)).toBe(true);
    expect(signIsRight('ADJUSTMENT', 0)).toBe(false);
    expect(signIsRight('BILL', 1.5)).toBe(false);
    // PR 619: the one switch transfer is the ERP's net of the customer advances it credits and the unpaid amounts it
    // moves (§3.3), so it may go either way; it is still never 0.
    expect(signIsRight('SWITCH_TRANSFER', 120000)).toBe(true);
    expect(signIsRight('SWITCH_TRANSFER', -30000)).toBe(true);
    expect(signIsRight('SWITCH_TRANSFER', 0)).toBe(false);
    const ev = (type: string, data: Record<string, unknown>, reverses: string | null = null) => ({ type: type as never, data, reverses });
    expect(entryKindOfEvent(ev('return.piece.decided', { decision: 'APPROVED' }))).toBe('RETURN_CREDIT');
    expect(entryKindOfEvent(ev('return.piece.decided', { decision: 'APPROVED_AT_PACKING' }))).toBe('RETURN_CREDIT');
    expect(entryKindOfEvent(ev('return.piece.decided', { decision: 'DECLINED' }))).toBeNull();
    expect(entryKindOfEvent(ev('exchange.settled', { kind: 'EXTRA' }))).toBe('EXCHANGE_EXTRA');
    expect(entryKindOfEvent(ev('exchange.settled', { kind: 'ADJUSTMENT' }))).toBe('EXCHANGE_ADJUSTMENT');
    expect(entryKindOfEvent(ev('exchange.settled', { kind: 'EVEN' }))).toBeNull();
    expect(entryKindOfEvent(ev('exchange.billed', {}))).toBe('EXCHANGE_BILL');
    expect(entryKindOfEvent(ev('exchange.credited', {}))).toBe('EXCHANGE_CREDIT');
    expect(entryKindOfEvent(ev('payment.recorded', {}))).toBe('PAYMENT');
    expect(entryKindOfEvent(ev('return.piece.decided', { decision: 'DECLINED' }, 'evt_1'))).toBe('REVERSAL');
    expect(entryKindOfEvent(ev('account.hold', {}))).toBeNull();
  });

  it('a wrong entry is put right by a reversal and a new entry: the balance is right, the history keeps all three', () => {
    const rows = chain([entry(1, 'BILL', 'ship:C-1', 65000), entry(2, 'REVERSAL', 'evt_rev', -65000, 'ship:C-1'), entry(3, 'BILL', 'ship:C-1b', 60000)]);
    expect(balanceOf(rows)).toBe(60000);
    expect(brokenLink(rows)).toBeNull();
  });

  it('BIGINT amounts from the database are read exactly, past the INTEGER limit, and never rounded', () => {
    // ৳3 crore in poisha is past 2 147 483 647 (INTEGER); the v6 lump-sum columns are BIGINT.
    expect(minorOf(3_000_000_000n)).toBe(3_000_000_000);
    expect(minorOf(-65000n)).toBe(-65000);
    expect(minorOf(65000)).toBe(65000);
    expect(() => minorOf(2n ** 60n)).toThrow(RangeError);
    expect(() => minorOf(1.5)).toThrow(RangeError);
    const big = chain([entry(1, 'BILL', 'ship:C-9', minorOf(3_000_000_000n))]);
    expect(balanceOf(big)).toBe(3_000_000_000);
    expect(brokenLink(big)).toBeNull();
  });

  it('any change to a kept entry, a gap or a removed entry breaks the chain at that entry (HISTORY_CHANGED)', () => {
    const rows = chain([entry(1, 'BILL', 'ship:C-1', 65000), entry(2, 'PAYMENT', 'evt_pay', -20000), entry(3, 'BILL', 'ship:C-2', 70000)]);
    expect(brokenLink(rows.map((r) => (r.seq === 2 ? { ...r, amountMinor: -2000 } : r)))).toEqual({ seq: 2, why: 'HASH' });
    expect(brokenLink([rows[0]!, rows[2]!])).toEqual({ seq: 3, why: 'GAP' });
    expect(brokenLink([rows[0]!, { ...rows[1]!, prevHash: null }, rows[2]!])).toEqual({ seq: 2, why: 'PREV_HASH' });
  });
});

describe('the pipeline stock (PR 615, §3.2)', () => {
  it('only billed, returning and waiting-check pieces are in it; waiting check is the ERP`s waitingCheck part', () => {
    const v = pipelineValue([
      { state: 'BILLED', buyingPriceMinor: 65000 },
      { state: 'RETURNING', buyingPriceMinor: 70000 },
      { state: 'WAITING_CHECK', buyingPriceMinor: 65000 },
      { state: 'DELIVERED', buyingPriceMinor: 99999 },
      { state: 'APPROVED', buyingPriceMinor: 99999 },
      { state: 'DECLINED', buyingPriceMinor: 99999 },
    ]);
    expect(v).toEqual({ totalMinor: 200000, waitingCheckMinor: 65000, pieces: 3 });
    expect(canMove(null, 'BILLED')).toBe(true);
    expect(canMove(null, 'DELIVERED')).toBe(false);
    expect(canMove('WAITING_CHECK', 'APPROVED')).toBe(true);
    expect(canMove('BILLED', 'APPROVED')).toBe(false);
  });
});

describe('the tie formula (§3.4): zero tolerance', () => {
  // A day: one piece billed at 650 and delivered, one at 700 still out, one at 650 declined after its check, a payment
  // of 500. Balance start 0 → +650 +700 +650 (bills) −500 (payment) = 1,500.
  const day = { balanceStartMinor: 0, balanceEndMinor: 150000, goodsMinor: 65000, returnLossesMinor: 65000, pipelineStartMinor: 0, pipelineEndMinor: 70000, switchTransferMinor: 0, paymentsMinor: 50000 };
  it('ties to zero when every piece left the pipeline once', () => {
    expect(tieRemainder(day)).toBe(0);
  });
  it('a delivered piece never costed, a credit counted twice or a payment missing leaves a named remainder', () => {
    expect(tieRemainder({ ...day, goodsMinor: 0 })).toBe(65000);
    expect(tieRemainder({ ...day, balanceEndMinor: 150000 - 65000 })).toBe(-65000);
    expect(tieRemainder({ ...day, paymentsMinor: 0 })).toBe(-50000);
  });
  it('the worst check result is the day`s result', () => {
    expect(worstResult(['MATCHED', 'PARTIAL'])).toBe('PARTIAL');
    expect(worstResult(['MATCHED', 'PENDING', 'PARTIAL'])).toBe('PENDING');
    expect(worstResult(['MATCHED', 'MISMATCH', 'PENDING'])).toBe('MISMATCH');
    expect(worstResult([])).toBe('MATCHED');
  });
  it('the six checks A–F and every difference class has its fix, never an edit', () => {
    expect(BOOKS_CHECKS.map((c) => BOOKS_CHECK_LETTER[c]).join('')).toBe('ABCDEF');
    expect(Object.keys(BOOKS_FIX)).toEqual([...BOOKS_DIFFERENCE_CLASSES]);
  });
});

describe('fixed costs and cost lines (PR 618, §3.3)', () => {
  it('a month spreads by its days, exact to the paisa, the remainder on the last day', () => {
    const oct = spreadByDays(3_000_000, 2026, 10);
    expect(oct).toHaveLength(31);
    expect(oct.reduce((a, b) => a + b, 0)).toBe(3_000_000);
    expect(oct[0]).toBe(96774);
    expect(oct[30]).toBe(3_000_000 - 96774 * 30);
    expect(spreadByDays(100, 2028, 2)).toHaveLength(29);
    expect(() => spreadByDays(-1, 2026, 10)).toThrow();
  });
  it('every shop cost line has its place in the summary; fixed costs are not one of them', () => {
    expect(Object.keys(COST_LINE_PATH)).toEqual([...COST_SUMMARY_LINES]);
    expect(COST_SUMMARY_LINES).not.toContain('FIXED');
  });
});

describe('periods (§4.2): week from Saturday, financial year from July by default', () => {
  const rules = { weekStart: 'saturday' as const, fiscalYearStartMonth: 7 };
  it('a business date falls in one week, month and financial year', () => {
    // 23 Oct 2026 is a Friday: its Saturday week is 17–23 Oct.
    expect(periodOf('2026-10-23', 'WEEK', rules)).toEqual({ start: '2026-10-17', end: '2026-10-23' });
    expect(periodOf('2026-10-24', 'WEEK', rules)).toEqual({ start: '2026-10-24', end: '2026-10-30' });
    expect(periodOf('2026-10-23', 'WEEK', { ...rules, weekStart: 'monday' })).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(periodOf('2026-02-10', 'MONTH', rules)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodOf('2026-10-23', 'YEAR', rules)).toEqual({ start: '2026-07-01', end: '2027-06-30' });
    expect(periodOf('2026-06-30', 'YEAR', rules)).toEqual({ start: '2025-07-01', end: '2026-06-30' });
    expect(periodOf('2026-06-30', 'YEAR', { ...rules, fiscalYearStartMonth: 1 })).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(() => periodOf('2026-02-30', 'MONTH', rules)).toThrow();
  });
});

describe('one ERP link per store (§16)', () => {
  it('each store has three secrets of its own; only their names are code', () => {
    expect(ERP_LINK_SECRET_FIELDS).toEqual(['apiKey', 'webhookSecret', 'signingSecret']);
  });

  it('a v6 store is refused a shared connection and a company another store holds', () => {
    expect(ERP_LINK_REFUSALS).toEqual(['SHARED_LINK', 'SHARED_COMPANY']);
  });
});
