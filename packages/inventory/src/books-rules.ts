// CN-028 · PR 617, 618 — the exact rules of what Retail sends the ERP, without a database: how one day's figures
// become the daily summary body (docs/erp/site-changes-v6.md §2.6, docs/RETAIL-ERP-MODEL.md §3.3), which categories are
// still unknown (`incomplete`, never sent as 0), when a summary that was not accepted is tried again, which days are
// still open for a re-send, how the ERP's stored copy is judged, how a month's fixed costs look on the wire and day by
// day, and the Books status card (§3.4, §4) built from what the books know. The database side is books-summary.ts,
// books-costs.ts and books-status.ts.
import { createHash } from 'node:crypto';
import {
  BOOKS_CHECKS,
  BOOKS_CHECK_LETTER,
  COST_LINE_PATH,
  COST_SUMMARY_LINES,
  ERP_FIXED_COST_LINES,
  minorOf,
  spreadByDays,
  summaryNetProfit,
  worstResult,
  type BooksCheck,
  type BooksDifferenceClass,
  type BooksResult,
  type CostSummaryLine,
  type ErpDailySummary,
  type ErpFixedCosts,
  type ErpStoredSummary,
  type ErpSummaryIncompleteKey,
} from '@extas/erp-types';

// ---- money on the wire ------------------------------------------------------------------------------------------------

/** Minor units in one unit of a currency (BDT: 100 poisha). */
export function minorPerUnit(currency: string): number {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

/**
 * Minor units as whole units of the currency, the way the ERP takes the summary (whole taka): half a unit and more
 * rounds away from zero. Every line is rounded once, and `netProfit` is worked out from the rounded lines, so the
 * ERP's own sum check always holds.
 */
export function wholeUnits(minor: number, perUnit: number): number {
  if (!Number.isSafeInteger(minor)) throw new RangeError('an amount left the exact range');
  const sign = minor < 0 ? -1 : 1;
  const units = Math.floor((Math.abs(minor) + perUnit / 2) / perUnit);
  return units === 0 ? 0 : sign * units;
}

/** Minor units as a decimal number of units, exact (fixed costs go to the paisa). */
export const unitsExact = (minor: number, perUnit: number): number => Number((minor / perUnit).toFixed(Math.round(Math.log10(perUnit))));

/** JSON with the keys of every object in sorted order: one text for one value, however it was built. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export const bodyHashOf = (body: unknown): string => createHash('sha256').update(stableJson(body)).digest('hex');

// ---- one day's figures → the summary body ----------------------------------------------------------------------------

/** What the shop's own records say about one day, every amount in minor units (books-summary.ts reads them). */
export interface DayFigures {
  day: string;
  orders: { count: number; pieces: number };
  /** Delivered pieces (PR 615's pipeline, the delivered day): regular price, customer price after discounts. */
  sales: { grossMinor: number; netMinor: number; pieces: number; unlinkedPieces: number };
  deliveryChargesMinor: number;
  deliveries: { delivered: number; failed: number; returned: number; codPendingMinor: number };
  customers: { new: number; returning: number };
  /** Buying price of the pieces delivered that day, and exchange extras − adjustments settled that day. */
  goods: { piecesMinor: number; exchangeMinor: number; unpricedDeliveries: number };
  /** Declined pieces on the decision day, and exchange bills − exchange credits that day. */
  returnLosses: { declinedMinor: number; exchangeMinor: number };
  /** For the ERP's information only, never a cost. */
  returns: { handedBackPieces: number; approvedCreditMinor: number; waitingCheckMinor: number };
  /** Each cost line's entries that day: their sum and how many there are (0 entries = no figure yet). */
  costs: Record<CostSummaryLine, { minor: number; entries: number }>;
  /**
   * Money review (owner's decision): the corrections of a closed month booked that day (PRIOR_PERIOD), as their own
   * "earlier-month corrections" figure of the shop's own P&L (+ Retail owes more). Never in the summary sent to the ERP:
   * contract v6 has no line for it (a v7 request); the books match counts it as its own term of the tie.
   */
  priorPeriod: { minor: number; corrections: number };
}

/** The summary's lines in minor units, kept beside the body for the books match and the explain view (PR 616). */
export interface SummaryMinor {
  salesGross: number;
  salesDiscounts: number;
  salesNet: number;
  deliveryCharges: number;
  goods: number;
  returnLosses: number;
  costs: Record<CostSummaryLine, number>;
}

export interface AssembledSummary {
  body: ErpDailySummary;
  bodyHash: string;
  incomplete: ErpSummaryIncompleteKey[];
  /** `netProfit` in minor units of the store currency (the body's whole units × minor per unit). */
  netProfitMinor: number;
  minor: SummaryMinor;
}

/** The `incomplete` key of each cost line (§2.6: the ads lines share one key). */
const INCOMPLETE_KEY: Readonly<Record<CostSummaryLine, ErpSummaryIncompleteKey>> = {
  PACKAGING: 'packaging',
  ACCESSORIES: 'accessories',
  PAYMENT_FEES: 'paymentFees',
  DELIVERY: 'delivery',
  ADS_FACEBOOK: 'ads',
  ADS_INSTAGRAM: 'ads',
  ADS_GOOGLE: 'ads',
  ADS_TIKTOK: 'ads',
  ADS_OTHER: 'ads',
  OTHER: 'other',
};
const INCOMPLETE_ORDER: readonly ErpSummaryIncompleteKey[] = ['orders', 'sales', 'income', 'deliveries', 'goods', 'returnLosses', 'packaging', 'delivery', 'paymentFees', 'accessories', 'ads', 'other', 'customers'];

/**
 * One day's summary body from the shop's own figures (§3.3). What is not known yet is listed in `incomplete` with what
 * is known so far, never a 0 that means "unknown":
 * - `sales` and `goods` when a delivered order has no delivered piece in the pipeline yet, or a delivered piece has no
 *   order line (they come from the same pieces, so they are unknown together);
 * - a cost line with no entry that day, unless the store says it never has that cost (`noCostLines`, then it is 0).
 * `sales.customerReturns` is always 0: there are no refunds after delivery (owner's rule), an exchange keeps the
 * original sale.
 * PR 619: `unknown` lists what the shop never recorded on that day at all (a day before the switch, filled backwards:
 * §3.5 "with `incomplete` marking what the shop never recorded"); those keys are always listed.
 */
export function assembleSummary(f: DayFigures, opts: { perUnit: number; noCostLines: readonly CostSummaryLine[]; unknown?: readonly ErpSummaryIncompleteKey[] }): AssembledSummary {
  const u = (minor: number) => wholeUnits(minor, opts.perUnit);
  const missing = new Set<ErpSummaryIncompleteKey>(opts.unknown ?? []);
  if (f.goods.unpricedDeliveries > 0 || f.sales.unlinkedPieces > 0) {
    missing.add('sales');
    missing.add('goods');
  }
  const never = new Set(opts.noCostLines);
  for (const line of COST_SUMMARY_LINES) if (!never.has(line) && f.costs[line].entries === 0) missing.add(INCOMPLETE_KEY[line]);

  const gross = u(f.sales.grossMinor);
  const net = u(f.sales.netMinor);
  const cost = (line: CostSummaryLine) => u(never.has(line) && f.costs[line].entries === 0 ? 0 : f.costs[line].minor);
  const goodsMinor = f.goods.piecesMinor + f.goods.exchangeMinor;
  const lossesMinor = f.returnLosses.declinedMinor + f.returnLosses.exchangeMinor;
  // Every cost line is set by the loop below from its own entries (COST_LINE_PATH covers each one).
  const costs = { goods: u(goodsMinor), returnLosses: u(lossesMinor), ads: {} } as ErpDailySummary['costs'];
  for (const line of COST_SUMMARY_LINES) {
    const [top, sub] = COST_LINE_PATH[line];
    if (top === 'ads' && sub) costs.ads[sub as keyof ErpDailySummary['costs']['ads']] = cost(line);
    else (costs as unknown as Record<string, number>)[top] = cost(line);
  }
  const incomplete = INCOMPLETE_ORDER.filter((k) => missing.has(k));
  const partial: Omit<ErpDailySummary, 'netProfit'> = {
    date: f.day,
    orders: { count: f.orders.count, pieces: f.orders.pieces },
    sales: { gross, discounts: gross - net, customerReturns: 0, net },
    income: { deliveryCharges: u(f.deliveryChargesMinor) },
    deliveries: { delivered: f.deliveries.delivered, failed: f.deliveries.failed, returned: f.deliveries.returned, codPending: u(f.deliveries.codPendingMinor) },
    costs,
    returns: { handedBackPieces: f.returns.handedBackPieces, approvedCredit: u(f.returns.approvedCreditMinor), waitingCheckValue: u(f.returns.waitingCheckMinor) },
    customers: { new: f.customers.new, returning: f.customers.returning },
    incomplete,
  };
  const body: ErpDailySummary = { ...partial, netProfit: summaryNetProfit(partial) };
  return {
    body,
    bodyHash: bodyHashOf(body),
    incomplete,
    netProfitMinor: body.netProfit * opts.perUnit,
    minor: {
      salesGross: f.sales.grossMinor,
      salesDiscounts: f.sales.grossMinor - f.sales.netMinor,
      salesNet: f.sales.netMinor,
      deliveryCharges: f.deliveryChargesMinor,
      goods: goodsMinor,
      returnLosses: lossesMinor,
      costs: Object.fromEntries(COST_SUMMARY_LINES.map((l) => [l, never.has(l) && f.costs[l].entries === 0 ? 0 : f.costs[l].minor])) as Record<CostSummaryLine, number>,
    },
  };
}

/** A day with nothing in it yet (every count 0, every cost line without an entry). */
export function emptyDay(day: string): DayFigures {
  const none = 0;
  return {
    day,
    orders: { count: 0, pieces: 0 },
    sales: { grossMinor: 0, netMinor: 0, pieces: 0, unlinkedPieces: 0 },
    deliveryChargesMinor: none,
    deliveries: { delivered: 0, failed: 0, returned: 0, codPendingMinor: none },
    customers: { new: 0, returning: 0 },
    goods: { piecesMinor: 0, exchangeMinor: 0, unpricedDeliveries: none },
    returnLosses: { declinedMinor: 0, exchangeMinor: 0 },
    priorPeriod: { minor: 0, corrections: 0 },
    returns: { handedBackPieces: 0, approvedCreditMinor: 0, waitingCheckMinor: 0 },
    costs: Object.fromEntries(COST_SUMMARY_LINES.map((l) => [l, { minor: 0, entries: 0 }])) as DayFigures['costs'],
  };
}

// ---- days, retries and the ERP's stored copy --------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function addDays(day: string, n: number): string {
  if (!DAY.test(day)) throw new RangeError(`not a day: ${day}`);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The days `from` … `to`, both included, oldest first (none when `to` is before `from`). */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Has the store's send time (`erp.summary.sendAt`, "HH:MM" local) come on the local day? `localTime` is "HH:MM". */
export const sendTimeCome = (localTime: string, sendAt: string): boolean => localTime >= sendAt;

/**
 * When a summary (or a month's fixed costs) that was not accepted is tried again: the waits of
 * `erp.summary.retry.minutes` in order after each failed try, the last wait repeating (1, 5, 15, 60, then every hour).
 */
export function nextTryAt(lastTryAt: Date, failedTries: number, waitsMinutes: readonly number[]): Date {
  if (!waitsMinutes.length) throw new RangeError('at least one wait');
  const wait = waitsMinutes[Math.min(Math.max(failedTries, 1), waitsMinutes.length) - 1]!;
  return new Date(lastTryAt.getTime() + wait * 60_000);
}

/** May a new version of a past day still be sent? Within `books.resend.days` before today and in a month not closed. */
export function dayOpen(day: string, today: string, resendDays: number, closedMonths: ReadonlySet<string>): boolean {
  return day < today && day >= addDays(today, -resendDays) && !closedMonths.has(day.slice(0, 7));
}

export type StoredVerdict = 'SAME' | 'MISSING' | 'STALE';

/**
 * The ERP's stored copy of a day against the last version the ERP accepted from the shop (check D, §4.1): MISSING when
 * the ERP has no copy, STALE when its netProfit or its incomplete list differs. The ERP's `bodyHash` is not compared
 * yet: v6 does not say how the ERP makes it (the v7 request of RETAIL-ERP-MODEL §13.3); comparing a hash made another
 * way would send the same day again every hour.
 */
export function storedVerdict(ours: { netProfit: number; incomplete: readonly string[] }, theirs: ErpStoredSummary | undefined): StoredVerdict {
  if (!theirs) return 'MISSING';
  if (theirs.netProfit !== null && Number(theirs.netProfit) !== ours.netProfit) return 'STALE';
  const a = [...ours.incomplete].sort().join(',');
  const b = [...theirs.incomplete].sort().join(',');
  return a === b ? 'SAME' : 'STALE';
}

/**
 * Did the ERP refuse a send for good (qa-gate)? A 4xx answer other than a timeout (408) or a rate limit (429): the same
 * key would only be refused again, so it is not tried again by itself — it waits for a person, a new version of the
 * day, or the ERP asking for the day again (then with a new key round).
 */
export const isRefusal = (httpStatus: number | null | undefined): boolean => httpStatus != null && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429;

/**
 * The tie's goods and return losses for one day (PR 616, check B; qa-gate): the exact minor lines kept with the day's
 * latest summary version (`minorLines`), never its whole-taka body (a piece at 450.50 is 451 on the wire and would break
 * the tie by 50 paisa on a correct day). When that version has no minor lines (built before 0056) or lists goods or
 * return losses as not known yet, the books' own figures from the pipeline and the account stand.
 */
export function tieLinesOf(summary: { incomplete: readonly string[]; minorLines: unknown } | null | undefined, derived: { goodsMinor: number; returnLossesMinor: number }): { goodsMinor: number; returnLossesMinor: number; summaryUsed: boolean } {
  const m = (summary?.minorLines ?? null) as { goods?: unknown; returnLosses?: unknown } | null;
  const usable = !!summary && !!m && !summary.incomplete.includes('goods') && !summary.incomplete.includes('returnLosses') && Number.isSafeInteger(m.goods) && Number.isSafeInteger(m.returnLosses);
  return usable ? { goodsMinor: m.goods as number, returnLossesMinor: m.returnLosses as number, summaryUsed: true } : { ...derived, summaryUsed: false };
}

// ---- PR 618 · fixed costs ------------------------------------------------------------------------------------------------

export type FixedCostLine = (typeof ERP_FIXED_COST_LINES)[number];
export type FixedCostsMinor = Record<FixedCostLine, number>;

/** `PUT /fixed-costs/{month}`: the month's costs in units of the currency, exact to the paisa. */
export function fixedCostsBody(month: string, c: FixedCostsMinor, note: string | null, perUnit: number): ErpFixedCosts {
  return { month, costs: { salary: unitsExact(c.salary, perUnit), rent: unitsExact(c.rent, perUnit), utilities: unitsExact(c.utilities, perUnit), other: unitsExact(c.other, perUnit) }, note };
}

/** The month in all, exact (qa-gate): added as whole numbers, a RangeError when it leaves the exact range. */
export const fixedCostsTotal = (c: FixedCostsMinor): number => minorOf(BigInt(c.salary) + BigInt(c.rent) + BigInt(c.utilities) + BigInt(c.other));

/**
 * The month's fixed costs day by day with the ERP's rule (`erp.fixedCosts.spread` = by the days of the month): every day
 * the same whole number of minor units, the remainder on the last day, so the days add up to the month exactly.
 */
export function fixedCostDays(month: string, c: FixedCostsMinor): { day: string; minor: number }[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return spreadByDays(fixedCostsTotal(c), y, m).map((minor, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`, minor }));
}

/** The ERP's stored month against the shop's last accepted version (check E): same only when every line is equal. */
export function fixedCostsSame(ours: FixedCostsMinor, theirs: { salary: string; rent: string; utilities: string; other: string } | undefined, perUnit: number): boolean {
  if (!theirs) return false;
  return ERP_FIXED_COST_LINES.every((k) => Math.round(Number(theirs[k]) * perUnit) === ours[k]);
}

/** The idempotency key of one send of a fixed-cost month version (`r` = sends the ERP accepted before, as for summaries). */
export const fixedCostsKey = (linkId: string, month: string, version: number, rounds: number): string => `fixedcosts:${linkId}:${month}:v${version}:r${rounds}`;

const monthAfter = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export type FixedMonthCheck = 'OK' | 'BEFORE_START' | 'TOO_FAR' | 'CLOSED';

/**
 * Which months the owner can set (PR 618): from the link's first month up to next month (set ahead before it starts),
 * never a closed month (the books of a closed month do not move; it is reopened first, PR 616).
 */
export function fixedMonthCheck(month: string, o: { today: string; startDay: string; closedMonths: ReadonlySet<string> }): FixedMonthCheck {
  if (month < o.startDay.slice(0, 7)) return 'BEFORE_START';
  if (month > monthAfter(o.today.slice(0, 7))) return 'TOO_FAR';
  if (o.closedMonths.has(month)) return 'CLOSED';
  return 'OK';
}

export type CostDayCheck = 'OK' | 'FUTURE' | 'BEFORE_START' | 'TOO_OLD' | 'CLOSED';

/**
 * Which days a cost line entry can count on (PR 618): today, or an open past day (`books.resend.days`, month not
 * closed), so every entry reaches the ERP in a summary; never a day before the link started or in the future.
 */
export function costDayCheck(day: string, o: { today: string; startDay: string; resendDays: number; closedMonths: ReadonlySet<string> }): CostDayCheck {
  if (day > o.today) return 'FUTURE';
  if (day < o.startDay) return 'BEFORE_START';
  if (o.closedMonths.has(day.slice(0, 7))) return 'CLOSED';
  if (day !== o.today && !dayOpen(day, o.today, o.resendDays, o.closedMonths)) return 'TOO_OLD';
  return 'OK';
}

// ---- the Books status card (§3.4, §4) ------------------------------------------------------------------------------------

export interface BooksCardInput {
  /** v5, or v6 without a link yet: the books start at the switch-over. */
  linked: boolean;
  /** The last match run's checks (PR 616), or null while none has run. */
  lastRun: { finishedAt: Date | null; status: string; checks: Partial<Record<BooksCheck, BooksResult>> } | null;
  lastClose: { date: string; result: BooksResult; tieRemainderMinor: number } | null;
  /** Open differences (PENDING or MISMATCH) by class, and the open TIE_BROKEN rows with what they point at. */
  openDifferences: Partial<Record<BooksDifferenceClass, number>>;
  tieBroken: { date: string; amountMinor: number | null; externalOrderId: string | null; detail: Record<string, unknown> }[];
  waitingCheck: { valueMinor: number; pieces: number; oldestSince: string | null };
  exchangesAtRiskMinor: number | null;
  summaries: { lastAccepted: string | null; waitingSend: number; refused: { date: string; error: string | null }[]; incompleteDays: { date: string; incomplete: string[] }[]; missingDays: string[] };
  fixedCosts: { month: string; inMonths: readonly string[]; waitingSend: number };
  today: string;
  waitingCheckWarnDays: number;
}

/** The six checks in their order with their letter (A–F), for the screens. */
export const BOOKS_CHECK_ORDER: readonly { check: BooksCheck; letter: string }[] = BOOKS_CHECKS.map((check) => ({ check, letter: BOOKS_CHECK_LETTER[check] }));

export type NeedKind = 'DIFFERENCES' | 'TIE_BROKEN' | 'SUMMARY_REFUSED' | 'SUMMARY_MISSING' | 'SUMMARY_INCOMPLETE' | 'FIXED_COSTS_MISSING' | 'WAITING_CHECK_OLD';

export interface NeedRow {
  kind: NeedKind;
  /** Words for the row (the screen turns them into text). */
  vars: Record<string, string | number>;
}

export interface BooksCard {
  state: 'NOT_LINKED' | 'NOT_RUN' | 'RAN';
  overall: BooksResult | null;
  checks: { check: BooksCheck; letter: string; result: BooksResult | null }[];
  partial: boolean;
  lastClose: BooksCardInput['lastClose'];
  waitingCheck: BooksCardInput['waitingCheck'] & { ageDays: number | null; old: boolean };
  exchangesAtRiskMinor: number | null;
  needs: NeedRow[];
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * The Books status card: each check A–F with its last result ("not run yet" until the match runs, PR 616), PARTIAL
 * where v6 cannot compare everything, the last day close and its tie, the pieces waiting for the owner's check and how
 * old the oldest is, the exchanges at risk, and the "Needs you now" rows — differences, a broken tie (named by day and
 * amount), summaries the ERP refused or lacks, days with figures still unknown, a month without its fixed costs, and
 * returned pieces waiting longer than `books.status.waitingCheckWarnDays`.
 */
export function booksCard(i: BooksCardInput): BooksCard {
  const checks = BOOKS_CHECKS.map((check) => ({ check, letter: BOOKS_CHECK_LETTER[check], result: i.lastRun?.checks[check] ?? null }));
  const ran = checks.filter((c) => c.result !== null).map((c) => c.result!);
  const ageDays = i.waitingCheck.oldestSince ? Math.max(0, daysBetween(i.waitingCheck.oldestSince, i.today)) : null;
  const old = ageDays !== null && i.waitingCheck.pieces > 0 && ageDays >= i.waitingCheckWarnDays;
  const needs: NeedRow[] = [];
  if (i.linked) {
    const diffs = Object.entries(i.openDifferences).filter(([k, n]) => k !== 'TIE_BROKEN' && (n ?? 0) > 0);
    for (const [kind, n] of diffs) needs.push({ kind: 'DIFFERENCES', vars: { kind, n: n ?? 0 } });
    for (const t of i.tieBroken) needs.push({ kind: 'TIE_BROKEN', vars: { date: t.date, amountMinor: t.amountMinor ?? 0, order: t.externalOrderId ?? '' } });
    for (const r of i.summaries.refused) needs.push({ kind: 'SUMMARY_REFUSED', vars: { date: r.date, error: r.error ?? '' } });
    if (i.summaries.missingDays.length) needs.push({ kind: 'SUMMARY_MISSING', vars: { n: i.summaries.missingDays.length, first: i.summaries.missingDays[0]! } });
    if (i.summaries.incompleteDays.length) needs.push({ kind: 'SUMMARY_INCOMPLETE', vars: { n: i.summaries.incompleteDays.length, first: i.summaries.incompleteDays[0]!.date } });
    if (!i.fixedCosts.inMonths.includes(i.fixedCosts.month)) needs.push({ kind: 'FIXED_COSTS_MISSING', vars: { month: i.fixedCosts.month } });
    if (old) needs.push({ kind: 'WAITING_CHECK_OLD', vars: { pieces: i.waitingCheck.pieces, days: ageDays! } });
  }
  return {
    state: !i.linked ? 'NOT_LINKED' : i.lastRun ? 'RAN' : 'NOT_RUN',
    overall: ran.length ? worstResult(ran) : null,
    checks,
    partial: ran.includes('PARTIAL'),
    lastClose: i.lastClose,
    waitingCheck: { ...i.waitingCheck, ageDays, old },
    exchangesAtRiskMinor: i.exchangesAtRiskMinor,
    needs,
  };
}
