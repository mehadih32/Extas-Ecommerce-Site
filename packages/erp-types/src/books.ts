// CN-028 · PR 616 (CN-029 Phase 0) — the books match (docs/RETAIL-ERP-MODEL.md §3.4, §4): the six checks, the
// difference classes and how each is fixed, the results, the close levels, the one tie formula, and which day, week,
// month and financial year a business date belongs to (week start and year start are settings, per store).

/** The checks of §4.1 (Prisma enum BooksCheck): A account · B ties · C returns · D summary · E fixed costs · F orders. */
export const BOOKS_CHECKS = ['ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'FIXED_COSTS', 'ORDERS'] as const;
export type BooksCheck = (typeof BOOKS_CHECKS)[number];
export const BOOKS_CHECK_LETTER: Readonly<Record<BooksCheck, 'A' | 'B' | 'C' | 'D' | 'E' | 'F'>> = { ACCOUNT: 'A', TIES: 'B', RETURNS: 'C', SUMMARY: 'D', FIXED_COSTS: 'E', ORDERS: 'F' };

/** The difference classes of §4.3 (Prisma enum BooksDifferenceClass). */
export const BOOKS_DIFFERENCE_CLASSES = ['MISSING_EVENT', 'UNKNOWN_ROW', 'AMOUNT_DIFF', 'UNMATCHED_PAYMENT', 'TIE_BROKEN', 'STALE_SUMMARY', 'HISTORY_CHANGED'] as const;
export type BooksDifferenceClass = (typeof BOOKS_DIFFERENCE_CLASSES)[number];

/** How each class is fixed: never by editing a number (§4.3). */
export const BOOKS_FIX: Readonly<Record<BooksDifferenceClass, 'PULL' | 'DECIDE' | 'NEW_ENTRY' | 'RECORD_OR_REVERSE' | 'FIND_PIECE' | 'RESEND' | 'BLOCK_CLOSE'>> = {
  MISSING_EVENT: 'PULL',
  UNKNOWN_ROW: 'DECIDE',
  AMOUNT_DIFF: 'NEW_ENTRY',
  UNMATCHED_PAYMENT: 'RECORD_OR_REVERSE',
  TIE_BROKEN: 'FIND_PIECE',
  STALE_SUMMARY: 'RESEND',
  HISTORY_CHANGED: 'BLOCK_CLOSE',
};

/** A difference's state (Prisma enum BooksDifferenceStatus). PENDING is timing only (`books.timing.maxMinutes`). */
export const BOOKS_DIFFERENCE_STATUSES = ['PENDING', 'MISMATCH', 'FIXED', 'OVERRIDDEN'] as const;
export type BooksDifferenceStatus = (typeof BOOKS_DIFFERENCE_STATUSES)[number];

/** A check's, a day's or a period's result (Prisma enum BooksResult). PARTIAL: matched as far as v6 can compare. */
export const BOOKS_RESULTS = ['MATCHED', 'PARTIAL', 'PENDING', 'MISMATCH'] as const;
export type BooksResult = (typeof BOOKS_RESULTS)[number];

/** The close levels built from the day closes (Prisma enum BooksPeriodLevel). */
export const BOOKS_PERIOD_LEVELS = ['WEEK', 'MONTH', 'YEAR', 'LIFETIME'] as const;
export type BooksPeriodLevel = (typeof BOOKS_PERIOD_LEVELS)[number];

export const BOOKS_RUN_STATUSES = ['RUNNING', 'DONE', 'FAILED'] as const;
export type BooksRunStatus = (typeof BOOKS_RUN_STATUSES)[number];
export const BOOKS_RUN_TRIGGERS = ['NIGHTLY', 'MANUAL', 'RECHECK'] as const;
export type BooksRunTrigger = (typeof BOOKS_RUN_TRIGGERS)[number];

export const BOOKS_ADJUSTMENT_KINDS = ['ADJUSTMENT', 'PRIOR_PERIOD'] as const;
export type BooksAdjustmentKind = (typeof BOOKS_ADJUSTMENT_KINDS)[number];

/** The worst of several results: one MISMATCH makes the whole a MISMATCH; PENDING beats PARTIAL beats MATCHED. */
export function worstResult(results: readonly BooksResult[]): BooksResult {
  const rank: Record<BooksResult, number> = { MATCHED: 0, PARTIAL: 1, PENDING: 2, MISMATCH: 3 };
  return results.reduce<BooksResult>((w, r) => (rank[r] > rank[w] ? r : w), 'MATCHED');
}

/** The parts of the tie formula for one period (minor units). I = the pipeline stock at buying price. */
export interface TieParts {
  balanceStartMinor: number;
  balanceEndMinor: number;
  goodsMinor: number;
  returnLossesMinor: number;
  pipelineStartMinor: number;
  pipelineEndMinor: number;
  switchTransferMinor: number;
  paymentsMinor: number;
}

/**
 * What the tie formula of §3.4 leaves over (0 = it ties; zero tolerance):
 * Balance(end) − [Balance(start) + goods + returnLosses + (I end − I start) + switch transfer − payments].
 * Payments are a positive amount Retail paid.
 */
export function tieRemainder(p: TieParts): number {
  const expected = p.balanceStartMinor + p.goodsMinor + p.returnLossesMinor + (p.pipelineEndMinor - p.pipelineStartMinor) + p.switchTransferMinor - p.paymentsMinor;
  const r = p.balanceEndMinor - expected;
  if (!Number.isSafeInteger(r)) throw new RangeError('the tie formula left the exact range');
  return r;
}

/** One difference the match found, before it is kept (BooksDifference). `key` keeps one row per difference across runs. */
export interface BooksDifferenceInput {
  date: string;
  check: BooksCheck;
  kind: BooksDifferenceClass;
  key: string;
  amountMinor: number | null;
  eventId: string | null;
  externalOrderId: string | null;
  detail: Record<string, unknown>;
}

/** One check's result for a day (BooksMatchRun.checks[check]). */
export interface BooksCheckResult {
  check: BooksCheck;
  result: BooksResult;
  /** What was compared, e.g. { shopRows: 12, erpRows: 12 }. */
  counts: Record<string, number>;
  differences: BooksDifferenceInput[];
}

/** A day's result across the checks, ready for its day close. */
export interface BooksDayResult {
  date: string;
  result: BooksResult;
  checks: BooksCheckResult[];
  tie: TieParts & { remainderMinor: number };
}

// ---- which period a business date belongs to --------------------------------------------------------------------------

/** The week starts (setting `books.week.start`, default Saturday). */
export const BOOKS_WEEKDAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
export type BooksWeekday = (typeof BOOKS_WEEKDAYS)[number];
const JS_DAY: Readonly<Record<BooksWeekday, number>> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

export interface PeriodRules {
  weekStart: BooksWeekday;
  /** The financial year's first month, 1–12 (setting `books.fiscalYear.startMonth`, default 7 = July). */
  fiscalYearStartMonth: number;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseDay = (d: string): Date => {
  const m = DAY_RE.exec(d);
  if (!m) throw new RangeError(`not a business date: ${d}`);
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (t.toISOString().slice(0, 10) !== d) throw new RangeError(`not a business date: ${d}`);
  return t;
};
const dayText = (t: Date): string => t.toISOString().slice(0, 10);
const addDays = (t: Date, n: number): Date => new Date(t.getTime() + n * 86_400_000);

/**
 * The week, month or financial year a business date (YYYY-MM-DD, the ERP's own date) belongs to, as its first and last
 * day. LIFETIME has no bounds of its own (it runs from the link's switch date) and is not asked here.
 */
export function periodOf(day: string, level: Exclude<BooksPeriodLevel, 'LIFETIME'>, rules: PeriodRules): { start: string; end: string } {
  const t = parseDay(day);
  if (level === 'WEEK') {
    const back = (t.getUTCDay() - JS_DAY[rules.weekStart] + 7) % 7;
    const start = addDays(t, -back);
    return { start: dayText(start), end: dayText(addDays(start, 6)) };
  }
  if (level === 'MONTH') {
    const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return { start: dayText(start), end: dayText(end) };
  }
  const m0 = rules.fiscalYearStartMonth - 1;
  if (!Number.isInteger(m0) || m0 < 0 || m0 > 11) throw new RangeError('the financial year starts in a month 1–12');
  const startYear = t.getUTCMonth() >= m0 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
  const start = new Date(Date.UTC(startYear, m0, 1));
  const end = addDays(new Date(Date.UTC(startYear + 1, m0, 1)), -1);
  return { start: dayText(start), end: dayText(end) };
}
