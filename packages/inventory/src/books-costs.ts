// CN-028 · PR 618 (CN-029 Phase 1) — the month's fixed costs and the extra cost lines (docs/RETAIL-ERP-MODEL.md §3.3,
// docs/erp/site-changes-v6.md §2.11), for the admin's Money → Costs page.
//
// Fixed costs: the owner sets each month's salary, rent, utilities and other (`fixedcosts.write`) and raises them when
// they rise. Every change is a new version (ErpFixedCostMonth, append-only; the same numbers again make none), logged in
// the audit log, and sent by `PUT /fixed-costs/{month}` from the summary tick (books-summary.ts: retried with the summary
// waits until accepted, and sent again when the ERP's `GET /fixed-costs` lacks the month or holds other numbers). The
// screen shows each month spread by day with the ERP's rule (`erp.fixedCosts.spread`: by the days of the month, exact to
// the paisa, the remainder on the last day). The amounts are the owner's own data: nothing ships with a number and
// nothing is copied from month to month by itself (the screen only offers last month's numbers to start from). Fixed
// costs never go into the daily summary's `costs.other`.
//
// The extra cost lines: packaging, accessories, payment and COD fees, courier, ads and other costs entered by hand count
// on their day's summary (CostEntry with `summaryLine` and `costDate`). An entry is never edited or deleted: a wrong one
// is reversed by a negative entry that points at it (with a reason), and the right one entered again. A cost counts only
// on today or an open day (`books.resend.days`, the month not closed), so every entry reaches the ERP; a past day's
// summary is built again at once (a LATE_FACT version, sent by the tick).
//
// qa-gate: a line and a month in all are capped (`books.costs.maxLineMinor`, `books.costs.maxMonthMinor`: a typing slip
// is refused, never kept and sent), and the page reads a stored month it cannot add up as "unreadable" instead of
// failing. Every write takes the link's lock (the books' `lockLink`, as the closes of PR 616 do) and checks the open
// day and the closed months under it. A cost entry carries the form's request key: a double tap or a retry answers the
// entry already written; building the day's summary again after the entry is written never fails the entry (the check
// job builds it within `erp.summary.checkMinutes`).
//
// Per store and per link (§16): everything reads and writes only the acting store's rows and its own open link. Nothing
// here moves money: these are the shop's own cost figures for the ERP's reports.
import { z } from 'zod';
import { requirePermission } from '@extas/auth';
import { COST_SUMMARY_LINES, ERP_FIXED_COST_LINES, minorOf, type CostSummaryLine } from '@extas/erp-types';
import { logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { lockLink } from './erp-account';
import { addDays, costDayCheck, fixedCostDays, fixedCostsTotal, fixedMonthCheck, type FixedCostsMinor } from './books-rules';
import { booksTarget, closedMonths, FIXED_SELECT, fixedVersionOrNull, localNow, openLinkOf, recordDaySummary, sendStates, type BooksTarget, type SendState } from './books-summary';

const dayText = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
/** The summary's cost lines in the order the screens show them (packaging … other). */
export const COST_LINE_ORDER: readonly CostSummaryLine[] = COST_SUMMARY_LINES;
/** The most the cost ledger holds in one entry (CostEntry.amountMinor is a 32-bit integer). */
const ENTRY_MAX = 2_147_483_647;
/** `refType` of a cost entry written from the form: its `refId` is the form's request key. */
const REQUEST_REF = 'books.request';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month as YYYY-MM');
const daySchema = z.iso.date();
const noteSchema = z.string().trim().max(500).nullish();
const requestKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, 'a request key of 8 to 100 letters, digits, - or _');

/** A month's fixed costs with the store's caps: each line at most `maxLine`, the month at most `maxMonth` in all. */
const fixedInputOf = (maxLine: number, maxMonth: number) =>
  z
    .object({
      month: monthSchema,
      salaryMinor: z.int().min(0).max(maxLine),
      rentMinor: z.int().min(0).max(maxLine),
      utilitiesMinor: z.int().min(0).max(maxLine),
      otherMinor: z.int().min(0).max(maxLine),
      note: noteSchema,
    })
    .refine((x) => BigInt(x.salaryMinor) + BigInt(x.rentMinor) + BigInt(x.utilitiesMinor) + BigInt(x.otherMinor) <= BigInt(maxMonth), { message: `the month in all is at most ${maxMonth}`, path: ['total'] });
const entryInputOf = (maxLine: number) =>
  z.object({ line: z.enum(COST_SUMMARY_LINES), day: daySchema, amountMinor: z.int().min(0).max(Math.min(ENTRY_MAX, maxLine)), note: noteSchema, requestKey: requestKeySchema.optional() });
const rangeInput = z.object({ from: daySchema.optional(), to: daySchema.optional() });

async function capsOf(deps: InventoryDeps, storeId: number): Promise<{ maxLine: number; maxMonth: number }> {
  const [maxLine, maxMonth] = await Promise.all([setting(deps, storeId, 'books.costs.maxLineMinor'), setting(deps, storeId, 'books.costs.maxMonthMinor')]);
  return { maxLine, maxMonth };
}

function storeOf(who: Who): number {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new InventoryError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  return who.storeId;
}

/** The store's books target for a write, or BOOKS_NOT_LINKED (v5, no ERP, no link yet). */
async function writeTarget(deps: InventoryDeps, storeId: number): Promise<BooksTarget> {
  const t = await booksTarget(deps, storeId);
  if (!t) throw new InventoryError('BOOKS_NOT_LINKED', 'the books with the ERP start at the switch-over (contract v6)');
  return t;
}

/** The open link for a read (never made here) and its first day, or null. */
async function readLink(deps: InventoryDeps, storeId: number, timeZone: string): Promise<{ id: string; startDay: string } | null> {
  if (!(await isV6(deps, storeId))) return null;
  const link = await openLinkOf(deps.db, storeId);
  if (!link) return null;
  if (link.startDay) return { id: link.id, startDay: link.startDay };
  const row = await deps.db.erpStoreLink.findUniqueOrThrow({ where: { id: link.id }, select: { createdAt: true } });
  return { id: link.id, startDay: localNow(row.createdAt, timeZone).day };
}

export type BooksSendState = 'NONE' | 'ACCEPTED' | 'WAITING' | 'RETRYING' | 'REFUSED';

/** How a version stands with the ERP: accepted, not tried yet, being tried again, or refused (a 4xx: a person looks). */
export function sendStateOf(s: SendState | undefined): Exclude<BooksSendState, 'NONE'> {
  if (s?.accepted) return 'ACCEPTED';
  if (!s?.tries) return 'WAITING';
  const st = s.lastStatus;
  return st !== null && st >= 400 && st < 500 && st !== 408 && st !== 429 ? 'REFUSED' : 'RETRYING';
}

// ---- fixed costs ---------------------------------------------------------------------------------------------------------

export interface FixedMonthView {
  month: string;
  entered: boolean;
  version: number | null;
  /** The latest version's lines in minor units, or null while the month has none. */
  lines: FixedCostsMinor | null;
  note: string | null;
  totalMinor: number | null;
  /** The month by day with the ERP's rule (empty while the month has none). */
  perDay: { day: string; minor: number }[];
  state: BooksSendState;
  versions: number;
  lastError: string | null;
  setAt: Date | null;
  /** Whether the month can be set now (not closed, within the months that can be set). */
  open: boolean;
  /** The latest version's amounts cannot be added up exactly (written before the caps): shown, never sent; set again. */
  unreadable: boolean;
}

export interface FixedCostsView {
  linked: boolean;
  today: string;
  startDay: string | null;
  currency: string;
  /** From the link's first month (the last 12 at most) up to next month, oldest first. */
  months: FixedMonthView[];
  /** The last month set, to start a new month from (the owner still saves it; nothing is copied by itself). */
  suggestion: ({ from: string } & Record<'salaryMinor' | 'rentMinor' | 'utilitiesMinor' | 'otherMinor', number>) | null;
}

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  for (let s = from; s <= to; s = `${y}-${String(m).padStart(2, '0')}`) {
    out.push(s);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};
const monthShift = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};

/** The months' fixed costs for the Costs page (`books.read`). */
export async function fixedCostsView(deps: InventoryDeps, who: Who): Promise<FixedCostsView> {
  const storeId = storeOf(who);
  await requirePermission(deps.db, who.actor, 'books.read', { storeId });
  const [timeZone, currency] = await Promise.all([setting(deps, storeId, 'store.timeZone'), setting(deps, storeId, 'store.currency')]);
  const today = localNow(nowOf(deps), timeZone).day;
  const link = await readLink(deps, storeId, timeZone);
  if (!link) return { linked: false, today, startDay: null, currency, months: [], suggestion: null };
  const thisMonth = today.slice(0, 7);
  const first = [link.startDay.slice(0, 7), monthShift(thisMonth, -11)].sort().at(-1)!;
  const shown = monthsBetween(first, monthShift(thisMonth, 1));
  const rows = await deps.db.erpFixedCostMonth.findMany({ where: { linkId: link.id, storeId }, orderBy: [{ month: 'asc' }, { version: 'desc' }], select: FIXED_SELECT });
  const latest = new Map<string, (typeof rows)[number]>();
  const count = new Map<string, number>();
  for (const r of rows) {
    const month = dayText(r.month).slice(0, 7);
    if (!latest.has(month)) latest.set(month, r);
    count.set(month, (count.get(month) ?? 0) + 1);
  }
  const [states, closed] = await Promise.all([sendStates(deps.db, link.id, [...latest.values()].map((r) => r.id)), closedMonths(deps.db, link.id)]);
  const readable = new Map([...latest].map(([month, r]) => [month, fixedVersionOrNull(r)]));
  const months = shown.map((month): FixedMonthView => {
    const r = latest.get(month);
    const open = fixedMonthCheck(month, { today, startDay: link.startDay, closedMonths: closed }) === 'OK';
    if (!r) return { month, entered: false, version: null, lines: null, note: null, totalMinor: null, perDay: [], state: 'NONE', versions: 0, lastError: null, setAt: null, open, unreadable: false };
    const s = states.get(r.id);
    const base = { month, entered: true, version: r.version, note: r.note, state: sendStateOf(s), versions: count.get(month) ?? 1, lastError: s?.accepted ? null : (s?.lastError ?? null), setAt: r.createdAt, open };
    const v = readable.get(month);
    if (!v) return { ...base, lines: null, totalMinor: null, perDay: [], unreadable: true };
    return { ...base, lines: v.lines, totalMinor: fixedCostsTotal(v.lines), perDay: fixedCostDays(month, v.lines), unreadable: false };
  });
  const last = [...readable.values()].filter((v) => v !== null).at(-1);
  const suggestion = last ? { from: last.month, salaryMinor: last.lines.salary, rentMinor: last.lines.rent, utilitiesMinor: last.lines.utilities, otherMinor: last.lines.other } : null;
  return { linked: true, today, startDay: link.startDay, currency, months, suggestion };
}

export interface SetFixedCostsResult {
  changed: boolean;
  version: number;
  id: string;
}

const sameLines = (a: FixedCostsMinor, b: FixedCostsMinor) => ERP_FIXED_COST_LINES.every((k) => a[k] === b[k]);

/**
 * Sets a month's fixed costs (`fixedcosts.write`): a new version when anything changed (the same numbers and note again
 * make none), logged; the summary tick sends it. A closed month cannot be set (it is reopened first, PR 616).
 */
export async function setFixedCosts(deps: InventoryDeps, who: Who, raw: unknown): Promise<SetFixedCostsResult> {
  const storeId = storeOf(who);
  await requirePermission(deps.db, who.actor, 'fixedcosts.write', { storeId });
  const caps = await capsOf(deps, storeId);
  const input = parse(fixedInputOf(caps.maxLine, caps.maxMonth), raw, 'fixed costs');
  const t = await writeTarget(deps, storeId);
  const today = localNow(nowOf(deps), t.timeZone).day;
  const lines: FixedCostsMinor = { salary: input.salaryMinor, rent: input.rentMinor, utilities: input.utilitiesMinor, other: input.otherMinor };
  const note = input.note || null;
  const month = asDate(`${input.month}-01`);
  try {
    return await deps.db.$transaction(async (tx) => {
      // Under the link's lock: a month closed at this moment is never written into.
      await lockLink(tx, t.link);
      const check = fixedMonthCheck(input.month, { today, startDay: t.link.startDay, closedMonths: await closedMonths(tx, t.link.id) });
      if (check === 'CLOSED') throw new InventoryError('BOOKS_DAY_CLOSED', `the books of ${input.month} are closed`, ['month']);
      if (check !== 'OK') throw new InventoryError('INVALID_INPUT', `fixed costs can be set from ${t.link.startDay.slice(0, 7)} up to next month`, [`month: ${check}`]);
      const prev = await tx.erpFixedCostMonth.findFirst({ where: { linkId: t.link.id, month }, orderBy: { version: 'desc' }, select: FIXED_SELECT });
      const before = prev ? fixedVersionOrNull(prev) : null;
      if (before && sameLines(before.lines, lines) && before.note === note) return { changed: false, version: before.version, id: before.id };
      const row = await tx.erpFixedCostMonth.create({
        data: {
          storeId,
          linkId: t.link.id,
          month,
          version: (prev?.version ?? 0) + 1,
          salaryMinor: BigInt(lines.salary),
          rentMinor: BigInt(lines.rent),
          utilitiesMinor: BigInt(lines.utilities),
          otherMinor: BigInt(lines.other),
          note,
          createdById: who.actor.staffUserId ?? null,
        },
        select: { id: true, version: true },
      });
      await logChange(tx, who, { action: 'books.fixedCosts.set', entityType: 'ErpFixedCostMonth', entityId: row.id, before: before ? { month: input.month, version: before.version, ...before.lines, note: before.note } : null, after: { month: input.month, version: row.version, ...lines, note }, storeId });
      return { changed: true, version: row.version, id: row.id };
    }, TX);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new InventoryError('CONFLICT', 'the month was set at the same moment; open it again');
    throw e;
  }
}

// ---- the extra cost lines ------------------------------------------------------------------------------------------------

export interface CostEntryRow {
  id: string;
  line: CostSummaryLine;
  day: string;
  amountMinor: number;
  currency: string;
  note: string | null;
  /** Entered on this page (only those can be reversed here; a statement's costs are put right at their source). */
  manual: boolean;
  source: string;
  createdAt: Date;
  /** The entry this one reverses, or the entry that reversed this one. */
  reverses: string | null;
  reversedBy: string | null;
  canReverse: boolean;
}

/**
 * Whether a past day's summary exists and is built again now (a LATE_FACT version the tick sends). Runs after the entry
 * is written: if it fails, the entry stands and the check job builds the day (never an error that invites a retry, which
 * would write the cost twice).
 */
async function resummarise(deps: InventoryDeps, t: BooksTarget, day: string, today: string): Promise<boolean> {
  if (day >= today) return false; // today's summary is built after the day ends
  try {
    if (!(await deps.db.erpDailySummary.findFirst({ where: { linkId: t.link.id, date: asDate(day) }, select: { id: true } }))) return false;
    return (await recordDaySummary(deps, t, day, 'LATE_FACT')).created;
  } catch {
    return false;
  }
}

/** Is `day` today or an open day of the link? Read with `db` — inside a write, the transaction holding the link's lock. */
async function dayAllowed(deps: InventoryDeps, db: Db, t: BooksTarget, day: string): Promise<{ today: string }> {
  const today = localNow(nowOf(deps), t.timeZone).day;
  const [resendDays, closed] = await Promise.all([setting(deps, t.link.storeId, 'books.resend.days'), closedMonths(db, t.link.id)]);
  const check = costDayCheck(day, { today, startDay: t.link.startDay, resendDays, closedMonths: closed });
  if (check === 'CLOSED' || check === 'TOO_OLD') throw new InventoryError('BOOKS_DAY_CLOSED', `${day} is no longer open in the books`, [`day: ${check}`]);
  if (check !== 'OK') throw new InventoryError('INVALID_INPUT', `a cost counts on today or an open day since ${t.link.startDay}`, [`day: ${check}`]);
  return { today };
}

/**
 * Enters one cost on a summary line for a day (`fixedcosts.write`); 0 means "none that day". With the form's
 * `requestKey`, a second call with the same key (a double tap, a retry after a lost answer) answers the entry already
 * written (`repeated`) and writes nothing.
 */
export async function addCostEntry(deps: InventoryDeps, who: Who, raw: unknown): Promise<{ id: string; resummarised: boolean; repeated: boolean }> {
  const storeId = storeOf(who);
  await requirePermission(deps.db, who.actor, 'fixedcosts.write', { storeId });
  const input = parse(entryInputOf((await capsOf(deps, storeId)).maxLine), raw, 'cost entry');
  const t = await writeTarget(deps, storeId);
  let today = '';
  const out = await deps.db.$transaction(async (tx) => {
    await lockLink(tx, t.link);
    if (input.requestKey) {
      const done = await tx.costEntry.findFirst({ where: { storeId, refType: REQUEST_REF, refId: input.requestKey }, select: { id: true } });
      if (done) return { id: done.id, repeated: true };
    }
    ({ today } = await dayAllowed(deps, tx, t, input.day));
    const row = await tx.costEntry.create({
      data: { storeId, service: 'books.costLine', module: 'books', amountMinor: input.amountMinor, currency: t.currency, refType: input.requestKey ? REQUEST_REF : null, refId: input.requestKey ?? null, detail: input.note || null, source: 'admin', occurredAt: nowOf(deps), summaryLine: input.line, costDate: asDate(input.day) },
      select: { id: true },
    });
    await logChange(tx, who, { action: 'books.costLine.add', entityType: 'CostEntry', entityId: row.id, before: null, after: { line: input.line, day: input.day, amountMinor: input.amountMinor, note: input.note || null }, storeId });
    return { id: row.id, repeated: false };
  }, TX);
  return { ...out, resummarised: out.repeated ? false : await resummarise(deps, t, input.day, today) };
}

/** Reverses a cost entered here (`fixedcosts.write`): a negative entry that points at it, with a reason. Never twice. */
export async function reverseCostEntry(deps: InventoryDeps, who: Who, entryId: string, raw: unknown): Promise<{ id: string; resummarised: boolean }> {
  const storeId = storeOf(who);
  await requirePermission(deps.db, who.actor, 'fixedcosts.write', { storeId });
  const reason = typeof (raw as { reason?: unknown })?.reason === 'string' ? (raw as { reason: string }).reason.trim().slice(0, 500) : '';
  if (!reason) throw new InventoryError('REASON_REQUIRED', 'say why the cost is reversed', ['reason']);
  if (!z.uuid().safeParse(entryId).success) throw new InventoryError('NOT_FOUND', 'no such cost entry');
  const t = await writeTarget(deps, storeId);
  let day = '';
  const id = await deps.db.$transaction(async (tx) => {
    // The link's lock first (as every books write), then the original row: one reversal at a time per entry.
    await lockLink(tx, t.link);
    await tx.$queryRaw`SELECT "id" FROM "CostEntry" WHERE "id" = ${entryId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
    const e = await tx.costEntry.findFirst({ where: { id: entryId, storeId }, select: { id: true, summaryLine: true, costDate: true, occurredAt: true, amountMinor: true, currency: true, module: true, refType: true } });
    if (!e || !e.summaryLine) throw new InventoryError('NOT_FOUND', 'no such cost entry');
    if (e.module !== 'books') throw new InventoryError('CONFLICT', 'a cost from a statement is put right at its source');
    if (e.refType === 'CostEntry') throw new InventoryError('CONFLICT', 'a reversal is not reversed; enter the cost again instead');
    if (await tx.costEntry.findFirst({ where: { storeId, refType: 'CostEntry', refId: e.id }, select: { id: true } })) throw new InventoryError('CONFLICT', 'this cost is already reversed');
    day = e.costDate ? dayText(e.costDate) : localNow(e.occurredAt, t.timeZone).day;
    await dayAllowed(deps, tx, t, day);
    const row = await tx.costEntry.create({
      data: { storeId, service: 'books.costLine', module: 'books', amountMinor: -e.amountMinor, currency: e.currency, refType: 'CostEntry', refId: e.id, detail: reason, source: 'admin.reversal', occurredAt: nowOf(deps), summaryLine: e.summaryLine, costDate: asDate(day) },
      select: { id: true },
    });
    await logChange(tx, who, { action: 'books.costLine.reverse', entityType: 'CostEntry', entityId: row.id, before: { entry: e.id, amountMinor: e.amountMinor }, after: { reverses: e.id, amountMinor: -e.amountMinor, reason }, storeId });
    return row.id;
  }, TX);
  return { id, resummarised: await resummarise(deps, t, day, localNow(nowOf(deps), t.timeZone).day) };
}

export interface CostEntriesResult {
  /** The latest `limit` entries of the span at most, newest day first. */
  rows: CostEntryRow[];
  limit: number;
  /** There are older entries in the span than the ones shown (the page says "showing the latest …"). */
  more: boolean;
}

/** The cost line entries of a span of days, newest day first (`books.read`); by default the open days. */
export async function costEntries(deps: InventoryDeps, who: Who, raw: unknown = {}): Promise<CostEntriesResult> {
  const storeId = storeOf(who);
  await requirePermission(deps.db, who.actor, 'books.read', { storeId });
  const q = parse(rangeInput, raw, 'days');
  const [timeZone, resendDays] = await Promise.all([setting(deps, storeId, 'store.timeZone'), setting(deps, storeId, 'books.resend.days')]);
  const link = await readLink(deps, storeId, timeZone);
  const limit = await setting(deps, storeId, 'books.costs.listLimit');
  if (!link) return { rows: [], limit, more: false };
  const today = localNow(nowOf(deps), timeZone).day;
  const to = q.to ?? today;
  const from = q.from ?? addDays(today, -resendDays);
  if (from > to || addDays(from, 366) < to) throw new InventoryError('INVALID_INPUT', 'from must be before to, a year at most', ['from', 'to']);
  return entriesOf(deps.db, { storeId, timeZone, from, to, today, startDay: link.startDay, resendDays, closed: await closedMonths(deps.db, link.id), limit });
}

async function entriesOf(db: Db, q: { storeId: number; timeZone: string; from: string; to: string; today: string; startDay: string; resendDays: number; closed: ReadonlySet<string>; limit: number }): Promise<CostEntriesResult> {
  const found = await db.$queryRaw<{ id: string; day: Date }[]>`
    SELECT e."id", COALESCE(e."costDate", (e."occurredAt" AT TIME ZONE ${q.timeZone})::date) AS "day"
    FROM "CostEntry" e
    WHERE e."storeId" = ${q.storeId} AND e."summaryLine" IS NOT NULL
      AND COALESCE(e."costDate", (e."occurredAt" AT TIME ZONE ${q.timeZone})::date) BETWEEN ${q.from}::date AND ${q.to}::date
    ORDER BY 2 DESC, e."createdAt" DESC
    LIMIT ${q.limit + 1}`;
  const more = found.length > q.limit;
  const ids = found.slice(0, q.limit);
  if (!ids.length) return { rows: [], limit: q.limit, more };
  const dayOf = new Map(ids.map((r) => [r.id, dayText(r.day)]));
  const [stored, reversals] = await Promise.all([
    db.costEntry.findMany({ where: { storeId: q.storeId, id: { in: ids.map((r) => r.id) } }, select: { id: true, summaryLine: true, amountMinor: true, currency: true, detail: true, module: true, source: true, refType: true, refId: true, createdAt: true } }),
    db.costEntry.findMany({ where: { storeId: q.storeId, refType: 'CostEntry', refId: { in: ids.map((r) => r.id) } }, select: { id: true, refId: true } }),
  ]);
  const byId = new Map(stored.map((r) => [r.id, r]));
  const reversedBy = new Map(reversals.map((r) => [r.refId!, r.id]));
  const rows = ids.map(({ id }): CostEntryRow => {
    const r = byId.get(id)!;
    const day = dayOf.get(id)!;
    const reverses = r.refType === 'CostEntry' ? r.refId : null;
    const manual = r.module === 'books';
    const open = costDayCheck(day, { today: q.today, startDay: q.startDay, resendDays: q.resendDays, closedMonths: q.closed }) === 'OK';
    return {
      id,
      line: r.summaryLine!,
      day,
      amountMinor: minorOf(r.amountMinor),
      currency: r.currency,
      note: r.detail,
      manual,
      source: r.source,
      createdAt: r.createdAt,
      reverses,
      reversedBy: reversedBy.get(id) ?? null,
      canReverse: manual && !reverses && !reversedBy.has(id) && open,
    };
  });
  return { rows, limit: q.limit, more };
}
