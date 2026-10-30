// CN-028 · PR 616 — the owner's closes of the books (docs/RETAIL-ERP-MODEL.md §4.4) and the owner's books PIN.
//
// - The days close themselves each night (books-match.ts) and roll up into weeks and the lifetime check. A MONTH is closed
//   by a person with `books.close` and the owner's PIN, once the month has ended: only when every day of it matched
//   (setting `books.close.requireMatched`, on) and its fixed costs are in. Otherwise only with the owner's override — a
//   reason (at least `books.adjust.reasonMinLength` letters) and the PIN; the override is kept on the close
//   (`override`, `overrideReason`, `pinVerified`) and every difference left in the month is marked OVERRIDDEN, so every
//   report of that month can say so.
// - Re-opening a month (PIN and reason) writes a new version that names the version it re-opens; its OVERRIDDEN
//   differences are open again. A closed row is never edited (append-only, hash-chained per link).
// - A financial YEAR (setting `books.fiscalYear.startMonth`) is signed off with the PIN once it has ended and every month
//   of it with books is closed.
// - The PIN (auth's pin.ts): set by the owner with his password, kept only as a scrypt hash, never logged. It is checked
//   outside the action's own transaction, so a wrong try is counted even though the action is refused.
// - qa-gate: every close, re-opening and sign-off locks the store's link FIRST and reads what it decides on (the days,
//   their differences, the fixed costs, the latest month or year) under that lock, so a day close or a difference the
//   nightly run writes at the same moment is seen, never a snapshot from before it.
// Everything is on the store's own ERP link.
import { minorOf, periodOf, type BooksResult } from '@extas/erp-types';
import { AuthError, ownerPinSet, setOwnerPin, verifyOwnerPin, type PinPolicy } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Who } from './context';
import { BooksError } from './books-errors';
import { booksStart, lockBooksLink, writePeriodClose } from './books-match';
import { addDay, allowBooks, booksLinkFor, dateOfDay, dayText, storeBooks, storeErpLink, type BooksLink } from './erp-account';
import { storeDate } from './erp-events-pull';
import { isV6 } from './erp-model';

// ---- the PIN ------------------------------------------------------------------------------------------------------------

/** The longest PIN taken (the registry lets `books.pin.minLength` go up to this; a longer text is a typing mistake). */
const PIN_MAX_DIGITS = 12;

async function pinPolicy(deps: InventoryDeps): Promise<PinPolicy> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([setting(deps, null, 'books.pin.minLength'), setting(deps, null, 'books.pin.maxAttempts'), setting(deps, null, 'books.pin.lockMinutes')]);
  return { minLength, maxLength: Math.max(minLength, PIN_MAX_DIGITS), maxAttempts, lockMinutes };
}

/** The owner sets (or changes) his books PIN with his password. Only an owner; the PIN is never stored or logged as typed. */
export async function setBooksPin(deps: InventoryDeps, who: Who, input: { password: string; pin: string }): Promise<{ set: true }> {
  await setOwnerPin(deps.db, who.actor, input, await pinPolicy(deps), nowOf(deps), { source: 'admin-api', ...who.ctx });
  return { set: true };
}

/** Whether an owner has set the books PIN (the pages say "set your PIN first"). */
export const booksPinSet = (deps: InventoryDeps): Promise<boolean> => ownerPinSet(deps.db);

/**
 * Checks the owner's PIN for one action of the books (an adjustment, a close). Call it before the action's transaction:
 * the try is counted and logged (without the PIN) whatever the action does next.
 */
export async function checkBooksPin(deps: InventoryDeps, who: Who, pin: string | null | undefined, action: string): Promise<{ ownerId: string }> {
  return verifyOwnerPin(deps.db, who.actor, pin, await pinPolicy(deps), { action, storeId: who.storeId, now: nowOf(deps), ctx: { source: 'admin-api', ...who.ctx } });
}

/** A typed PIN must be there before anything else is looked at (PIN_REQUIRED, never "invalid input"). */
export function needPin(pin: unknown): void {
  if (typeof pin !== 'string' || !pin.trim()) throw new AuthError('PIN_REQUIRED', "this needs the owner's PIN", ['pin']);
}

/** A reason at least `books.adjust.reasonMinLength` letters long. */
export async function reasonOf(deps: InventoryDeps, text: unknown, field: string): Promise<string> {
  const min = await setting(deps, null, 'books.adjust.reasonMinLength');
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length < min || t.length > 1000) throw new BooksError('INVALID_INPUT', `the reason needs at least ${min} letters`, [field]);
  return t;
}

// ---- months -------------------------------------------------------------------------------------------------------------

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'a month, YYYY-MM' });
const monthInput = z.object({ month: monthSchema, pin: z.string().max(64), overrideReason: z.string().max(1000).nullish() }).strict();
const reopenInput = z.object({ month: monthSchema, pin: z.string().max(64), reason: z.string().max(1000) }).strict();
const yearInput = z.object({ year: z.int().min(2000).max(9999), pin: z.string().max(64), overrideReason: z.string().max(1000).nullish() }).strict();

export type CloseMonthInput = z.input<typeof monthInput>;
export type ReopenMonthInput = z.input<typeof reopenInput>;
export type SignOffYearInput = z.input<typeof yearInput>;

/** A period close as the pages and the reports read it. */
export interface PeriodCloseView {
  id: string;
  level: 'WEEK' | 'MONTH' | 'YEAR' | 'LIFETIME';
  start: string;
  end: string;
  version: number;
  result: BooksResult;
  openingMinor: number;
  closingMinor: number;
  matchedDays: number;
  totalDays: number;
  override: boolean;
  overrideReason: string | null;
  /** The version this row re-opens (a re-opening), or null for a close. */
  reopens: number | null;
  pinVerified: boolean;
  closedById: string | null;
  createdAt: string;
}

type PeriodRow = Prisma.BooksPeriodCloseGetPayload<true>;

export function periodView(r: PeriodRow): PeriodCloseView {
  return {
    id: r.id,
    level: r.level,
    start: dayText(r.periodStart),
    end: dayText(r.periodEnd),
    version: r.version,
    result: r.result,
    openingMinor: minorOf(r.openingBalanceMinor),
    closingMinor: minorOf(r.closingBalanceMinor),
    matchedDays: r.matchedDays,
    totalDays: r.totalDays,
    override: r.override,
    overrideReason: r.overrideReason,
    reopens: r.reopens,
    pinVerified: r.pinVerified,
    closedById: r.closedById,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The latest close of each day in a range, with whether it matched (MATCHED or PARTIAL and no open difference). */
export async function dayStates(db: Db, link: Pick<BooksLink, 'id'>, from: string, to: string): Promise<{ date: string; version: number | null; result: BooksResult | null; matched: boolean; openingMinor: number; closingMinor: number; open: number }[]> {
  const rows = await db.$queryRaw<{ date: Date; version: number; result: BooksResult; openingBalanceMinor: bigint; closingBalanceMinor: bigint }[]>`
    SELECT DISTINCT ON ("date") "date", "version", "result"::text AS "result", "openingBalanceMinor", "closingBalanceMinor" FROM "BooksDayClose"
    WHERE "linkId" = ${link.id}::uuid AND "date" BETWEEN ${dateOfDay(from)}::date AND ${dateOfDay(to)}::date ORDER BY "date", "version" DESC`;
  const byDay = new Map(rows.map((r) => [dayText(r.date), r]));
  const open = await db.booksDifference.groupBy({ by: ['date'], where: { linkId: link.id, date: { gte: dateOfDay(from), lte: dateOfDay(to) }, status: { in: ['PENDING', 'MISMATCH'] } }, _count: { _all: true } });
  const openOf = new Map(open.map((o) => [dayText(o.date), o._count._all]));
  const out = [];
  for (let d = from; d <= to; d = addDay(d, 1)) {
    const r = byDay.get(d);
    const n = openOf.get(d) ?? 0;
    out.push({ date: d, version: r?.version ?? null, result: r?.result ?? null, matched: !!r && (r.result === 'MATCHED' || r.result === 'PARTIAL') && n === 0, openingMinor: r ? minorOf(r.openingBalanceMinor) : 0, closingMinor: r ? minorOf(r.closingBalanceMinor) : 0, open: n });
  }
  return out;
}

const numberOr = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const latestMonth = (db: Db, linkId: string, start: string) => db.booksPeriodClose.findFirst({ where: { linkId, level: 'MONTH', periodStart: dateOfDay(start) }, orderBy: { version: 'desc' } });

/** A month is closed when its newest row is a close (not a re-opening). */
const isClosed = (r: { reopens: number | null } | null) => !!r && r.reopens == null;

async function rulesOf(deps: InventoryDeps, storeId: number) {
  const [weekStart, fiscalYearStartMonth] = await Promise.all([setting(deps, storeId, 'books.week.start'), setting(deps, storeId, 'books.fiscalYear.startMonth')]);
  return { weekStart, fiscalYearStartMonth };
}

/**
 * Closes a month (`books.close` and the owner's PIN). Refused while the month runs (MONTH_NOT_ENDED), when it is closed
 * (ALREADY), when no day of the books is in it (NOTHING_TO_CLOSE), when a day did not match (NOT_MATCHED, `details` =
 * the days) or its fixed costs are not in (FIXED_COSTS_MISSING) — unless the owner overrides with a reason.
 */
export async function closeMonth(deps: InventoryDeps, who: Who, input: CloseMonthInput): Promise<PeriodCloseView> {
  await allowBooks(deps, who, 'books.close');
  needPin(input?.pin);
  const d = parse(monthInput, input, 'month close');
  const override = d.overrideReason != null && d.overrideReason.trim() !== '' ? await reasonOf(deps, d.overrideReason, 'overrideReason') : null;
  const link = await booksLinkFor(deps, who.storeId);
  const rules = await rulesOf(deps, who.storeId);
  const { start, end } = periodOf(`${d.month}-01`, 'MONTH', rules);
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  const today = storeDate(nowOf(deps), timeZone);
  if (today <= end) throw new BooksError('MONTH_NOT_ENDED', 'the month has not ended yet', [d.month]);
  await checkBooksPin(deps, who, d.pin, override ? 'books.close.month.override' : 'books.close.month');
  const requireMatched = await setting(deps, who.storeId, 'books.close.requireMatched');

  const closedById = who.actor.staffUserId ?? null;
  const row = await deps.db.$transaction(async (tx) => {
    // The link first: a day close or a difference the run writes at this moment is seen by every read below.
    await lockBooksLink(tx, link);
    if (isClosed(await latestMonth(tx, link.id, start))) throw new BooksError('ALREADY', 'this month is closed', [d.month]);
    const first = await booksStart(tx, link);
    const from = first && first > start ? first : start;
    if (!first || from > end) throw new BooksError('NOTHING_TO_CLOSE', 'no day of the books is in this month', [d.month]);
    const days = await dayStates(tx, link, from, end);
    const unmatched = days.filter((x) => !x.matched).map((x) => x.date);
    if (requireMatched && unmatched.length && !override) throw new BooksError('NOT_MATCHED', 'a month closes only when every day matched', unmatched);
    const shopCosts = await tx.erpFixedCostMonth.findFirst({ where: { linkId: link.id, month: dateOfDay(start) }, orderBy: { version: 'desc' }, select: { version: true } });
    const costsOpen = await tx.booksDifference.count({ where: { linkId: link.id, check: 'FIXED_COSTS', date: dateOfDay(start), status: { in: ['PENDING', 'MISMATCH'] } } });
    const fixedCostsMissing = !shopCosts;
    if ((fixedCostsMissing || costsOpen > 0) && !override) throw new BooksError('FIXED_COSTS_MISSING', "the month's fixed costs are not in (or differ from the ERP's)", [d.month]);
    const left = override ? await tx.booksDifference.updateMany({ where: { linkId: link.id, date: { gte: dateOfDay(start), lte: dateOfDay(end) }, status: { in: ['PENDING', 'MISMATCH'] } }, data: { status: 'OVERRIDDEN' } }) : { count: 0 };
    const results = days.map((x) => x.result ?? 'MISMATCH');
    const result: BooksResult = unmatched.length || fixedCostsMissing || costsOpen ? 'MISMATCH' : results.includes('PARTIAL') ? 'PARTIAL' : 'MATCHED';
    const figures = {
      days: days.map((x) => ({ date: x.date, version: x.version, result: x.result, matched: x.matched })),
      unmatchedDays: unmatched,
      fixedCostsMissing,
      fixedCostsDiffer: costsOpen > 0,
      fixedCostsVersion: shopCosts?.version ?? null,
      overriddenDifferences: left.count,
    };
    const r = await writePeriodClose(tx, link, {
      level: 'MONTH',
      start,
      end,
      result,
      openingMinor: days[0]!.openingMinor,
      closingMinor: days.at(-1)!.closingMinor,
      matchedDays: days.length - unmatched.length,
      totalDays: days.length,
      figures,
      override: !!override,
      overrideReason: override,
      pinVerified: true,
      closedById,
    });
    await logChange(tx, who, { action: override ? 'books.close.month.override' : 'books.close.month', entityType: 'BooksPeriodClose', entityId: r.id, before: null, after: { month: d.month, version: r.version, result, unmatchedDays: unmatched, fixedCostsMissing, reason: override }, storeId: who.storeId });
    return r;
  }, TX);
  return periodView(row);
}

/** Re-opens a closed month (`books.close`, the PIN and a reason): a new version naming the one it re-opens. */
export async function reopenMonth(deps: InventoryDeps, who: Who, input: ReopenMonthInput): Promise<PeriodCloseView> {
  await allowBooks(deps, who, 'books.close');
  needPin(input?.pin);
  const d = parse(reopenInput, input, 'month re-opening');
  const reason = await reasonOf(deps, d.reason, 'reason');
  const link = await booksLinkFor(deps, who.storeId);
  const { start, end } = periodOf(`${d.month}-01`, 'MONTH', await rulesOf(deps, who.storeId));
  const seen = await latestMonth(deps.db, link.id, start);
  if (!seen || !isClosed(seen)) throw new BooksError('CONFLICT', 'this month is not closed', [d.month]);
  await checkBooksPin(deps, who, d.pin, 'books.close.month.reopen');
  const row = await deps.db.$transaction(async (tx) => {
    await lockBooksLink(tx, link);
    const latest = await latestMonth(tx, link.id, start);
    if (!latest || latest.id !== seen.id) throw new BooksError('CONFLICT', 'this month changed meanwhile; look again', [d.month]);
    const back = await tx.booksDifference.updateMany({ where: { linkId: link.id, date: { gte: dateOfDay(start), lte: dateOfDay(end) }, status: 'OVERRIDDEN' }, data: { status: 'MISMATCH' } });
    const r = await writePeriodClose(tx, link, {
      level: 'MONTH',
      start,
      end,
      result: latest.result,
      openingMinor: minorOf(latest.openingBalanceMinor),
      closingMinor: minorOf(latest.closingBalanceMinor),
      matchedDays: latest.matchedDays,
      totalDays: latest.totalDays,
      figures: { reopened: true, reopenedDifferences: back.count },
      overrideReason: reason,
      reopens: latest.version,
      pinVerified: true,
      closedById: who.actor.staffUserId ?? null,
    });
    await logChange(tx, who, { action: 'books.close.month.reopen', entityType: 'BooksPeriodClose', entityId: r.id, before: { version: latest.version }, after: { month: d.month, version: r.version, reason }, storeId: who.storeId });
    return r;
  }, TX);
  return periodView(row);
}

/** Signs off a financial year (`books.close`, the PIN): it has ended and every month of it with books is closed. */
export async function signOffYear(deps: InventoryDeps, who: Who, input: SignOffYearInput): Promise<PeriodCloseView> {
  await allowBooks(deps, who, 'books.close');
  needPin(input?.pin);
  const d = parse(yearInput, input, 'year sign-off');
  const override = d.overrideReason != null && d.overrideReason.trim() !== '' ? await reasonOf(deps, d.overrideReason, 'overrideReason') : null;
  const link = await booksLinkFor(deps, who.storeId);
  const rules = await rulesOf(deps, who.storeId);
  const { start, end } = periodOf(`${d.year}-${String(rules.fiscalYearStartMonth).padStart(2, '0')}-01`, 'YEAR', rules);
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  if (storeDate(nowOf(deps), timeZone) <= end) throw new BooksError('MONTH_NOT_ENDED', 'the year has not ended yet', [String(d.year)]);
  await checkBooksPin(deps, who, d.pin, 'books.close.year');
  const row = await deps.db.$transaction(async (tx) => {
    // The link first: a month closed or re-opened at this moment is seen.
    await lockBooksLink(tx, link);
    const latestYear = await tx.booksPeriodClose.findFirst({ where: { linkId: link.id, level: 'YEAR', periodStart: dateOfDay(start) }, orderBy: { version: 'desc' }, select: { reopens: true } });
    if (isClosed(latestYear)) throw new BooksError('ALREADY', 'this year is signed off', [String(d.year)]);
    const first = await booksStart(tx, link);
    if (!first || first > end) throw new BooksError('NOTHING_TO_CLOSE', 'no day of the books is in this year', [String(d.year)]);
    const months: { month: string; version: number | null; closed: boolean; override: boolean; result: BooksResult | null; openingMinor: number; closingMinor: number; matchedDays: number; totalDays: number }[] = [];
    for (let m = (first > start ? first : start).slice(0, 7); `${m}-01` <= end; m = addDay(periodOf(`${m}-01`, 'MONTH', rules).end, 1).slice(0, 7)) {
      const r = await latestMonth(tx, link.id, `${m}-01`);
      months.push({ month: m, version: r?.version ?? null, closed: isClosed(r), override: !!r?.override, result: r?.result ?? null, openingMinor: r ? minorOf(r.openingBalanceMinor) : 0, closingMinor: r ? minorOf(r.closingBalanceMinor) : 0, matchedDays: r?.matchedDays ?? 0, totalDays: r?.totalDays ?? 0 });
    }
    const open = months.filter((m) => !m.closed).map((m) => m.month);
    if (open.length) throw new BooksError('NOT_MATCHED', 'a year is signed off only when every month of it is closed', open);
    const anyOverride = months.some((m) => m.override);
    const r = await writePeriodClose(tx, link, {
      level: 'YEAR',
      start,
      end,
      result: anyOverride ? 'MISMATCH' : months.some((m) => m.result === 'PARTIAL') ? 'PARTIAL' : 'MATCHED',
      openingMinor: months[0]!.openingMinor,
      closingMinor: months.at(-1)!.closingMinor,
      matchedDays: months.reduce((s, m) => s + m.matchedDays, 0),
      totalDays: months.reduce((s, m) => s + m.totalDays, 0),
      figures: { months: months.map((m) => ({ month: m.month, version: m.version, override: m.override, result: m.result })), monthsOverridden: months.filter((m) => m.override).map((m) => m.month) },
      override: anyOverride || !!override,
      overrideReason: override,
      pinVerified: true,
      closedById: who.actor.staffUserId ?? null,
    });
    await logChange(tx, who, { action: 'books.close.year', entityType: 'BooksPeriodClose', entityId: r.id, before: null, after: { year: d.year, start, end, version: r.version, reason: override }, storeId: who.storeId });
    return r;
  }, TX);
  return periodView(row);
}

// ---- the closes page ----------------------------------------------------------------------------------------------------

export interface MonthState {
  month: string;
  start: string;
  end: string;
  /** The month has ended (it can be closed). */
  ended: boolean;
  closed: boolean;
  versions: number;
  override: boolean;
  overrideReason: string | null;
  result: BooksResult | null;
  matchedDays: number;
  totalDays: number;
  closedAt: string | null;
}

export interface BooksClosesView {
  model: 'v5' | 'v6';
  pinSet: boolean;
  today: string | null;
  months: MonthState[];
  years: PeriodCloseView[];
  weeks: PeriodCloseView[];
  /** The newest lifetime check (on a month's last day): ours against the ERP's balance since the switch. */
  lifetime: (PeriodCloseView & { erpClosingMinor: number | null }) | null;
  /** The days of one month (when asked for): the latest close of each and whether it matched. */
  days: { date: string; version: number | null; result: BooksResult | null; matched: boolean; open: number }[] | null;
}

/** Every month of the books with its state, the years, the latest weeks and the lifetime check (`books.read`). */
export async function booksCloses(deps: InventoryDeps, who: Who, q: { month?: string | null } = {}): Promise<BooksClosesView> {
  await allowBooks(deps, who, 'books.read');
  const pinSet = await booksPinSet(deps);
  const empty: BooksClosesView = { model: 'v6', pinSet, today: null, months: [], years: [], weeks: [], lifetime: null, days: null };
  if (!(await isV6(deps, who.storeId))) return { ...empty, model: 'v5' };
  const link = await storeErpLink(deps.db, who.storeId);
  if (!link) return empty;
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  const today = storeDate(nowOf(deps), timeZone);
  const first = await booksStart(deps.db, link);
  const rules = await rulesOf(deps, who.storeId);
  const rows = await deps.db.booksPeriodClose.findMany({ where: { linkId: link.id }, orderBy: [{ periodStart: 'asc' }, { version: 'asc' }] });
  const months: MonthState[] = [];
  if (first) {
    for (let m = first.slice(0, 7); `${m}-01` <= today; m = addDay(periodOf(`${m}-01`, 'MONTH', rules).end, 1).slice(0, 7)) {
      const p = periodOf(`${m}-01`, 'MONTH', rules);
      const mine = rows.filter((r) => r.level === 'MONTH' && dayText(r.periodStart) === p.start);
      const last = mine.at(-1) ?? null;
      const lastClose = [...mine].reverse().find((r) => r.reopens == null) ?? null;
      months.push({
        month: m,
        start: p.start,
        end: p.end,
        ended: today > p.end,
        closed: isClosed(last),
        versions: mine.length,
        override: isClosed(last) && !!last?.override,
        overrideReason: lastClose?.overrideReason ?? null,
        result: lastClose?.result ?? null,
        matchedDays: lastClose?.matchedDays ?? 0,
        totalDays: lastClose?.totalDays ?? 0,
        closedAt: isClosed(last) ? last!.createdAt.toISOString() : null,
      });
    }
  }
  const newest = (level: 'WEEK' | 'YEAR' | 'LIFETIME') => {
    const by = new Map<string, PeriodRow>();
    for (const r of rows.filter((x) => x.level === level)) by.set(dayText(r.periodStart), r);
    return [...by.values()].map(periodView);
  };
  const pageSize = await setting(deps, who.storeId, 'books.ledger.pageSize');
  const lifetime = rows.filter((r) => r.level === 'LIFETIME').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1);
  let days: BooksClosesView['days'] = null;
  if (q.month && monthSchema.safeParse(q.month).success && first) {
    const p = periodOf(`${q.month}-01`, 'MONTH', rules);
    const from = first > p.start ? first : p.start;
    const to = p.end < today ? p.end : addDay(today, -1);
    days = from <= to ? (await dayStates(deps.db, link, from, to)).map(({ date, version, result, matched, open }) => ({ date, version, result, matched, open })) : [];
  }
  return { model: 'v6', pinSet, today, months: months.reverse(), years: newest('YEAR').reverse(), weeks: newest('WEEK').reverse().slice(0, pageSize), lifetime: lifetime ? { ...periodView(lifetime), erpClosingMinor: numberOr((lifetime.figures as { erpClosingMinor?: unknown } | null)?.erpClosingMinor) } : null, days };
}
