// CN-028 · PR 617, 618 — the owner's rules for what Retail sends the ERP, without a database: every summary line has
// one documented source, the sample of the contract adds up, nothing unknown is sent as 0, the waits between tries,
// the open days, the ERP's stored copy, the fixed-cost spread exact to the paisa, and the Books status card's honest
// "not run yet" until the match runs. Every amount is a made-up test value.
import { describe, expect, it } from 'vitest';
import { COST_SUMMARY_LINES, SUMMARY_LINE_SOURCES, summaryNetProfit, tieRemainder } from '@extas/erp-types';
import {
  addDays,
  assembleSummary,
  booksCard,
  bodyHashOf,
  dayOpen,
  emptyDay,
  costDayCheck,
  fixedCostDays,
  fixedCostsBody,
  fixedCostsKey,
  fixedCostsSame,
  fixedMonthCheck,
  minorPerUnit,
  nextTryAt,
  storedVerdict,
  wholeUnits,
  type BooksCardInput,
  type DayFigures,
} from '../src/books-rules';

const BDT = minorPerUnit('BDT');
const allKnown = (f: DayFigures, minor: Partial<Record<(typeof COST_SUMMARY_LINES)[number], number>> = {}) => {
  for (const l of COST_SUMMARY_LINES) f.costs[l] = { minor: minor[l] ?? 0, entries: 1 };
  return f;
};

/** The contract's own sample day (site-changes-v6 §2.6), in poisha. */
function sampleDay(): DayFigures {
  const f = allKnown(emptyDay('2026-11-02'), { PACKAGING: 185_000, DELIVERY: 460_000, PAYMENT_FEES: 65_000, ACCESSORIES: 40_000, ADS_FACEBOOK: 520_000, ADS_GOOGLE: 130_000, OTHER: 90_000 });
  f.orders = { count: 42, pieces: 61 };
  // gross 98500, net 88400 (the sample's 6200 discounts + 3900 returns are all discount here: no refunds after delivery)
  f.sales = { grossMinor: 9_850_000, netMinor: 8_840_000, pieces: 55, unlinkedPieces: 0 };
  f.deliveryChargesMinor = 370_000;
  f.deliveries = { delivered: 37, failed: 2, returned: 3, codPendingMinor: 2_150_000 };
  f.goods = { piecesMinor: 4_125_000, exchangeMinor: 0, unpricedDeliveries: 0 };
  f.returnLosses = { declinedMinor: 65_000, exchangeMinor: 0 };
  f.returns = { handedBackPieces: 4, approvedCreditMinor: 260_000, waitingCheckMinor: 1_170_000 };
  f.customers = { new: 18, returning: 11 };
  return f;
}

describe('PR 617 · every summary line has one source', () => {
  it('each line of the summary body is named once in SUMMARY_LINE_SOURCES, with the day it counts on', () => {
    const lines = SUMMARY_LINE_SOURCES.map((s) => s.line);
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of ['orders', 'sales.gross', 'sales.discounts', 'sales.net', 'income.deliveryCharges', 'deliveries', 'costs.goods', 'costs.returnLosses', 'costs.packaging', 'costs.accessories', 'costs.paymentFees', 'costs.delivery', 'costs.ads', 'costs.other']) {
      expect(lines, l).toContain(l);
    }
    // Fixed costs are a source of their own (PUT /fixed-costs), never a line of the daily costs.
    expect(SUMMARY_LINE_SOURCES.find((s) => s.line === 'costs.other')!.source).toMatch(/never fixed costs/);
  });

  it('the contract`s sample adds up: costs 56800, profit 35300 before fixed costs', () => {
    const s = assembleSummary(sampleDay(), { perUnit: BDT, noCostLines: [] });
    const c = s.body.costs;
    expect(c.goods + c.returnLosses + c.packaging + c.delivery + c.paymentFees + c.accessories + c.ads.facebook + c.ads.google + c.other).toBe(56_800);
    expect(s.body.netProfit).toBe(35_300);
    expect(s.body.netProfit).toBe(summaryNetProfit(s.body));
    expect(s.body.sales).toEqual({ gross: 98_500, discounts: 10_100, customerReturns: 0, net: 88_400 });
    expect(s.incomplete).toEqual([]);
    expect(s.netProfitMinor).toBe(3_530_000);
  });

  it('goods and return losses are exactly the shop`s figures, so the day ties with tieRemainder (zero tolerance)', () => {
    // One piece billed at 650, delivered the same day; one at 700 billed and declined; Retail paid 1000.
    const f = allKnown(emptyDay('2026-11-03'));
    f.goods.piecesMinor = 65_000;
    f.returnLosses.declinedMinor = 70_000;
    const s = assembleSummary(f, { perUnit: BDT, noCostLines: [] });
    const r = tieRemainder({
      balanceStartMinor: 50_000,
      balanceEndMinor: 50_000 + 135_000 - 100_000,
      goodsMinor: s.minor.goods,
      returnLossesMinor: s.minor.returnLosses,
      pipelineStartMinor: 0,
      pipelineEndMinor: 0,
      switchTransferMinor: 0,
      paymentsMinor: 100_000,
    });
    expect(r).toBe(0);
    // A delivered piece never costed breaks the tie by its buying price, named.
    expect(tieRemainder({ balanceStartMinor: 0, balanceEndMinor: 65_000, goodsMinor: 0, returnLossesMinor: 0, pipelineStartMinor: 0, pipelineEndMinor: 0, switchTransferMinor: 0, paymentsMinor: 0 })).toBe(65_000);
  });

  it('exchange extras and adjustments sit in goods; exchange bills and credits in return losses (§2.10.6)', () => {
    const f = allKnown(emptyDay('2026-11-04'));
    f.goods = { piecesMinor: 0, exchangeMinor: 5_000, unpricedDeliveries: 0 }; // settled +50 (650 → 700)
    f.returnLosses = { declinedMinor: 0, exchangeMinor: 70_000 - 65_000 }; // billed 700, credited 650
    const s = assembleSummary(f, { perUnit: BDT, noCostLines: [] });
    expect([s.body.costs.goods, s.body.costs.returnLosses, s.body.netProfit]).toEqual([50, 50, -100]);
  });
});

describe('PR 617 · nothing unknown is sent as 0', () => {
  it('a cost line with no entry that day is listed incomplete, with what is known so far', () => {
    const f = allKnown(emptyDay('2026-11-05'), { PACKAGING: 10_000 });
    f.costs.ADS_FACEBOOK = { minor: 0, entries: 0 };
    f.costs.ACCESSORIES = { minor: 0, entries: 0 };
    const s = assembleSummary(f, { perUnit: BDT, noCostLines: [] });
    expect(s.incomplete).toEqual(['accessories', 'ads']);
    expect(s.body.incomplete).toEqual(['accessories', 'ads']);
    expect(s.body.costs.packaging).toBe(100);
  });

  it('a cost the store says it never has is 0 and complete; on a fresh store every cost line starts incomplete', () => {
    const fresh = assembleSummary(emptyDay('2026-11-06'), { perUnit: BDT, noCostLines: [] });
    expect(fresh.incomplete).toEqual(['packaging', 'delivery', 'paymentFees', 'accessories', 'ads', 'other']);
    const s = assembleSummary(emptyDay('2026-11-06'), { perUnit: BDT, noCostLines: [...COST_SUMMARY_LINES] });
    expect(s.incomplete).toEqual([]);
    expect(s.body.netProfit).toBe(0);
  });

  it('a delivered order with no delivered piece in the pipeline makes sales and goods incomplete', () => {
    const f = allKnown(emptyDay('2026-11-07'));
    f.goods.unpricedDeliveries = 1;
    expect(assembleSummary(f, { perUnit: BDT, noCostLines: [] }).incomplete).toEqual(['sales', 'goods']);
    const g = allKnown(emptyDay('2026-11-07'));
    g.sales.unlinkedPieces = 1;
    expect(assembleSummary(g, { perUnit: BDT, noCostLines: [] }).incomplete).toEqual(['sales', 'goods']);
  });

  it('whole taka on the wire: each line rounds once, half away from zero, and netProfit follows the sent lines', () => {
    expect([wholeUnits(12_349, 100), wholeUnits(12_350, 100), wholeUnits(-12_350, 100), wholeUnits(-49, 100)]).toEqual([123, 124, -124, 0]);
    const f = allKnown(emptyDay('2026-11-08'), { PAYMENT_FEES: 1_850, OTHER: 1_850 });
    f.sales = { grossMinor: 100_000, netMinor: 100_000, pieces: 1, unlinkedPieces: 0 };
    const s = assembleSummary(f, { perUnit: BDT, noCostLines: [] });
    expect([s.body.costs.paymentFees, s.body.costs.other, s.body.netProfit]).toEqual([19, 19, 962]);
  });

  it('the same figures give the same body hash; any change gives another', () => {
    const a = assembleSummary(sampleDay(), { perUnit: BDT, noCostLines: [] });
    const b = assembleSummary(sampleDay(), { perUnit: BDT, noCostLines: [] });
    expect(a.bodyHash).toBe(b.bodyHash);
    expect(bodyHashOf({ b: 1, a: 2 })).toBe(bodyHashOf({ a: 2, b: 1 }));
    const f = sampleDay();
    f.costs.OTHER.minor += 100;
    expect(assembleSummary(f, { perUnit: BDT, noCostLines: [] }).bodyHash).not.toBe(a.bodyHash);
  });
});

describe('PR 617 · tries, open days and the ERP`s stored copy', () => {
  it('waits 1, 5, 15 and 60 minutes between tries, then every hour (erp.summary.retry.minutes)', () => {
    const t0 = new Date('2026-11-03T18:30:00Z');
    const waits = [1, 5, 15, 60];
    expect([1, 2, 3, 4, 5, 9].map((n) => (nextTryAt(t0, n, waits).getTime() - t0.getTime()) / 60_000)).toEqual([1, 5, 15, 60, 60, 60]);
  });

  it('a past day is open for a new version within books.resend.days and while its month is not closed', () => {
    expect(dayOpen('2026-11-02', '2026-11-16', 14, new Set())).toBe(true);
    expect(dayOpen('2026-11-01', '2026-11-16', 14, new Set())).toBe(false);
    expect(dayOpen('2026-11-16', '2026-11-16', 14, new Set())).toBe(false);
    expect(dayOpen('2026-10-31', '2026-11-03', 14, new Set(['2026-10']))).toBe(false);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('the ERP`s copy: missing, stale by profit or list, or the same', () => {
    const ours = { netProfit: 100, incomplete: ['ads'] };
    const stored = (over: Partial<{ netProfit: string | null; incomplete: string[]; bodyHash: string | null }>) => ({ date: '2026-11-02', receivedAt: null, versions: 1, netProfit: '100', incomplete: ['ads'], bodyHash: null, ...over });
    expect(storedVerdict(ours, undefined)).toBe('MISSING');
    expect(storedVerdict(ours, stored({}))).toBe('SAME');
    expect(storedVerdict(ours, stored({ netProfit: '99' }))).toBe('STALE');
    expect(storedVerdict(ours, stored({ incomplete: [] }))).toBe('STALE');
    // The ERP's own body hash is not compared until v7 says how it is made (it would resend every hour).
    expect(storedVerdict(ours, stored({ bodyHash: 'erp-made' }))).toBe('SAME');
  });
});

describe('PR 618 · fixed costs', () => {
  it('November 71500 in all: 2383.33 a day, the remainder on the last day, 71500 for the month', () => {
    const c = { salary: 4_500_000, rent: 2_000_000, utilities: 450_000, other: 200_000 };
    const days = fixedCostDays('2026-11', c);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ day: '2026-11-01', minor: 238_333 });
    expect(days[29]).toEqual({ day: '2026-11-30', minor: 7_150_000 - 238_333 * 29 });
    expect(days.reduce((s, d) => s + d.minor, 0)).toBe(7_150_000);
    expect(fixedCostsBody('2026-11', c, 'salary raised from November', BDT)).toEqual({ month: '2026-11', costs: { salary: 45_000, rent: 20_000, utilities: 4_500, other: 2_000 }, note: 'salary raised from November' });
    expect(fixedCostsBody('2026-11', { salary: 12_345, rent: 0, utilities: 0, other: 0 }, null, BDT).costs.salary).toBe(123.45);
  });

  it('the ERP`s month is the same only when every line is equal', () => {
    const c = { salary: 4_500_000, rent: 2_000_000, utilities: 450_000, other: 200_000 };
    expect(fixedCostsSame(c, { salary: '45000', rent: '20000', utilities: '4500.00', other: '2000' }, BDT)).toBe(true);
    expect(fixedCostsSame(c, { salary: '45000', rent: '20000', utilities: '4500', other: '2001' }, BDT)).toBe(false);
    expect(fixedCostsSame(c, undefined, BDT)).toBe(false);
  });

  it('a month can be set from the link`s first month up to next month, never in a closed month', () => {
    const o = { today: '2026-11-20', startDay: '2026-11-01', closedMonths: new Set<string>() };
    expect(fixedMonthCheck('2026-11', o)).toBe('OK');
    expect(fixedMonthCheck('2026-12', o)).toBe('OK'); // set ahead, before the month starts
    expect(fixedMonthCheck('2027-01', o)).toBe('TOO_FAR');
    expect(fixedMonthCheck('2026-10', o)).toBe('BEFORE_START');
    expect(fixedMonthCheck('2026-11', { ...o, closedMonths: new Set(['2026-11']) })).toBe('CLOSED');
    expect(fixedMonthCheck('2026-12', { ...o, today: '2026-12-31' })).toBe('OK');
    expect(fixedMonthCheck('2027-01', { ...o, today: '2026-12-31' })).toBe('OK'); // across the year
  });

  it('a new key for every version and for every send after the ERP accepted one (a known key is only replayed)', () => {
    expect(fixedCostsKey('L1', '2026-11', 2, 0)).toBe('fixedcosts:L1:2026-11:v2:r0');
    expect(fixedCostsKey('L1', '2026-11', 2, 1)).not.toBe(fixedCostsKey('L1', '2026-11', 2, 0));
    expect(fixedCostsKey('L2', '2026-11', 2, 0)).not.toBe(fixedCostsKey('L1', '2026-11', 2, 0));
  });
});

describe('PR 618 · the extra cost lines', () => {
  const o = { today: '2026-11-20', startDay: '2026-11-01', resendDays: 7, closedMonths: new Set<string>() };
  it('a cost can be entered for today and for the open days, which then go to the ERP again', () => {
    expect(costDayCheck('2026-11-20', o)).toBe('OK');
    expect(costDayCheck('2026-11-13', o)).toBe('OK');
    expect(costDayCheck('2026-11-12', o)).toBe('TOO_OLD'); // past books.resend.days: the ERP would never see it
    expect(costDayCheck('2026-11-21', o)).toBe('FUTURE');
    expect(costDayCheck('2026-10-31', { ...o, today: '2026-11-03' })).toBe('BEFORE_START');
    expect(costDayCheck('2026-11-19', { ...o, closedMonths: new Set(['2026-11']) })).toBe('CLOSED');
  });
});

describe('the Books status card', () => {
  const base = (over: Partial<BooksCardInput> = {}): BooksCardInput => ({
    linked: true,
    lastRun: null,
    lastClose: null,
    openDifferences: {},
    tieBroken: [],
    waitingCheck: { valueMinor: 0, pieces: 0, oldestSince: null },
    exchangesAtRiskMinor: null,
    summaries: { lastAccepted: null, waitingSend: 0, refused: [], incompleteDays: [], missingDays: [] },
    fixedCosts: { month: '2026-11', inMonths: ['2026-11'], waitingSend: 0 },
    today: '2026-11-20',
    waitingCheckWarnDays: 7,
    ...over,
  });

  it('says "not run yet" honestly until the match runs, and "not linked" before the switch-over', () => {
    const card = booksCard(base());
    expect(card.state).toBe('NOT_RUN');
    expect(card.overall).toBeNull();
    expect(card.checks.map((c) => `${c.letter}:${c.result}`)).toEqual(['A:null', 'B:null', 'C:null', 'D:null', 'E:null', 'F:null']);
    expect(booksCard(base({ linked: false })).state).toBe('NOT_LINKED');
    expect(booksCard(base({ linked: false, fixedCosts: { month: '2026-11', inMonths: [], waitingSend: 0 } })).needs).toEqual([]);
  });

  it('after a run: the worst check wins, PARTIAL is shown, a broken tie is named by day and amount', () => {
    const card = booksCard(
      base({
        lastRun: { finishedAt: new Date(), status: 'DONE', checks: { ACCOUNT: 'PARTIAL', TIES: 'MISMATCH', RETURNS: 'MATCHED' } },
        openDifferences: { TIE_BROKEN: 1, AMOUNT_DIFF: 2 },
        tieBroken: [{ date: '2026-11-19', amountMinor: 65_000, externalOrderId: 'WEB-1043', detail: {} }],
      }),
    );
    expect([card.state, card.overall, card.partial]).toEqual(['RAN', 'MISMATCH', true]);
    expect(card.needs).toEqual([
      { kind: 'DIFFERENCES', vars: { kind: 'AMOUNT_DIFF', n: 2 } },
      { kind: 'TIE_BROKEN', vars: { date: '2026-11-19', amountMinor: 65_000, order: 'WEB-1043' } },
    ]);
  });

  it('needs you now: refused and missing summaries, unknown figures, a month without fixed costs, old unchecked returns', () => {
    const card = booksCard(
      base({
        summaries: { lastAccepted: '2026-11-18', waitingSend: 1, refused: [{ date: '2026-11-19', error: 'INVALID_SUMMARY' }], incompleteDays: [{ date: '2026-11-17', incomplete: ['ads'] }], missingDays: ['2026-11-15'] },
        fixedCosts: { month: '2026-11', inMonths: ['2026-10'], waitingSend: 0 },
        waitingCheck: { valueMinor: 117_000, pieces: 2, oldestSince: '2026-11-10' },
      }),
    );
    expect(card.waitingCheck).toMatchObject({ ageDays: 10, old: true });
    expect(card.needs.map((n) => n.kind)).toEqual(['SUMMARY_REFUSED', 'SUMMARY_MISSING', 'SUMMARY_INCOMPLETE', 'FIXED_COSTS_MISSING', 'WAITING_CHECK_OLD']);
  });
});
