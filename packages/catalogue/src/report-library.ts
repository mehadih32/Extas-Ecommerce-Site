// S28 · PR 689 (admin prototype v5, Reports › Report library) — the pieces of the library that are not a profit figure:
//   - the shared period bar (`periodRange`: today, last 7 days, last 30 days, this month, last month, each with the span just
//     before it for "compare") and `changePct`;
//   - the restock verdict (`restockVerdict`, `restockReport`): from the shop's own facts, which live styles to bring in again
//     (a size that sold is out, or the stock lasts fewer than `reports.library.restockCoverDays` days at the 30-day speed) and
//     which sit unsold (`deadAfterDays` old, nothing sold in 30 days, still in stock);
//   - the sales by weekday and hour (`salesByTime`) and the discount given (`discountGiven`);
//   - saved views and pins (`ReportView`): a view keeps a report's period, compare switch and filters under the owner's own
//     name; a pin puts a library card on Home. Both are archived, never deleted.
// Read-only reports: nothing here moves money, changes a price or sends anything. Seeing needs `reports.read`.
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { CatalogueError } from './errors';
import { parse, type CatalogueDeps, type Who } from './context';
import { loadRankInputs, type RankInput } from './ranking';

const DAY_MS = 86_400_000;

// ---- pure ---------------------------------------------------------------------------------------------------------------

export const PERIOD_PRESETS = ['today', 'last7', 'last30', 'month', 'lastmonth', 'last3m', 'last6m', 'last12m'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface PeriodRange {
  preset: PeriodPreset | 'custom';
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => ymd(new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS));
const spanDays = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS) + 1;

/** The first day of the month `n` months before the month of `day`. */
function monthStart(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return ymd(d);
}

/** Your own dates (`from` to `to`, both included) with the span of the same length just before; null for a bad or backwards pair. */
export function customRange(from: string, to: string): PeriodRange | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && ymd(new Date(`${s}T00:00:00Z`)) === s;
  if (!ok(from) || !ok(to) || from > to) return null;
  const prevTo = addDays(from, -1);
  return { preset: 'custom', from, to, prevFrom: addDays(prevTo, -(spanDays(from, to) - 1)), prevTo };
}

/** A preset as days in the shop's own calendar (`today` = the shop's today) and the span of the same length just before it. */
export function periodRange(preset: PeriodPreset, today: string): PeriodRange {
  let from = today;
  let to = today;
  if (preset === 'last7') from = addDays(today, -6);
  else if (preset === 'last30') from = addDays(today, -29);
  else if (preset === 'month') from = `${today.slice(0, 7)}-01`;
  else if (preset === 'lastmonth') {
    to = addDays(`${today.slice(0, 7)}-01`, -1);
    from = `${to.slice(0, 7)}-01`;
  }
  const monthsBack = { last3m: 3, last6m: 6, last12m: 12 }[preset as 'last3m'];
  if (monthsBack) {
    // the whole months before this one, compared with the same number of months before them
    to = addDays(`${today.slice(0, 7)}-01`, -1);
    from = monthStart(today, monthsBack);
    return { preset, from, to, prevFrom: monthStart(today, monthsBack * 2), prevTo: addDays(from, -1) };
  }
  const prevTo = addDays(from, -1);
  // last month is compared with the whole month before it; any other span with the span of the same length just before
  if (preset === 'lastmonth') return { preset, from, to, prevFrom: `${prevTo.slice(0, 7)}-01`, prevTo };
  return { preset, from, to, prevFrom: addDays(prevTo, -(spanDays(from, to) - 1)), prevTo };
}

/** The change from `before` to `now` in whole percent; null when there is nothing before to compare with. */
export function changePct(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

export type RestockVerdict = 'RESTOCK' | 'ENOUGH' | 'UNSOLD';

/** One style: bring it in again, enough for now, or sitting unsold. */
export function restockVerdict(i: Pick<RankInput, 'sold30' | 'sizesTotal' | 'sizesInStock' | 'stockDays' | 'ageDays'>, s: { restockCoverDays: number; deadAfterDays: number }): RestockVerdict {
  if (i.sold30 > 0 && (i.sizesInStock < i.sizesTotal || (i.stockDays !== null && i.stockDays <= s.restockCoverDays))) return 'RESTOCK';
  if (i.sold30 === 0 && i.sizesInStock > 0 && i.ageDays >= s.deadAfterDays) return 'UNSOLD';
  return 'ENOUGH';
}

// ---- reports ------------------------------------------------------------------------------------------------------------

async function allowReports(deps: CatalogueDeps, who: Who): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new CatalogueError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, 'reports.read', { storeId: who.storeId });
}

export interface RestockRow {
  productId: string;
  name: string;
  verdict: Exclude<RestockVerdict, 'ENOUGH'>;
  sold30: number;
  sizesInStock: number;
  sizesTotal: number;
  stockDays: number | null;
}

export interface RestockReport {
  restock: RestockRow[];
  unsold: RestockRow[];
}

/** "What should I restock now?" and "What is sitting unsold?" (`reports.read`). Most urgent first; at most `limit` of each. */
export async function restockReport(deps: CatalogueDeps, who: Who, o: { limit?: number } = {}): Promise<RestockReport> {
  await allowReports(deps, who);
  const s = await deps.settings.value('reports.library', { storeId: who.storeId });
  const limit = Math.min(200, Math.max(1, Math.floor(o.limit ?? 50)));
  const { inputs, names } = await loadRankInputs(deps, who.storeId);
  const rows: RestockRow[] = [];
  for (const i of inputs) {
    const verdict = restockVerdict(i, s);
    if (verdict === 'ENOUGH') continue;
    rows.push({ productId: i.productId, name: names.get(i.productId)?.name ?? '', verdict, sold30: i.sold30, sizesInStock: i.sizesInStock, sizesTotal: i.sizesTotal, stockDays: i.stockDays });
  }
  const restock = rows.filter((r) => r.verdict === 'RESTOCK').sort((a, b) => (a.stockDays ?? 0) - (b.stockDays ?? 0) || b.sold30 - a.sold30);
  const unsold = rows.filter((r) => r.verdict === 'UNSOLD').sort((a, b) => b.sizesInStock - a.sizesInStock);
  return { restock: restock.slice(0, limit), unsold: unsold.slice(0, limit) };
}

const SOLD_STATUS = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED'];

export interface SalesByTime {
  /** Orders placed on each weekday (0 = Sunday … 6 = Saturday) and each hour of the day (0–23), in the shop's own time. */
  weekday: number[];
  hour: number[];
  orders: number;
  /** The discount given in the period (the order lines' discount, coupons included) and the orders that used a coupon. */
  discountMinor: number;
  couponOrders: number;
}

/** When orders come in, and what was given away in discounts (`reports.read`). */
export async function salesByTime(deps: CatalogueDeps, who: Who, range: { from: string; to: string }): Promise<SalesByTime> {
  await allowReports(deps, who);
  const timeZone = await deps.settings.value('store.timeZone', { storeId: who.storeId });
  const rows = await deps.db.$queryRaw<{ dow: number; h: number; n: bigint; discount: bigint; coupons: bigint }[]>`
    SELECT EXTRACT(DOW FROM (o."placedAt" AT TIME ZONE ${timeZone}))::int AS "dow",
           EXTRACT(HOUR FROM (o."placedAt" AT TIME ZONE ${timeZone}))::int AS "h",
           COUNT(*) AS "n", COALESCE(SUM(o."discountMinor"), 0) AS "discount",
           COUNT(*) FILTER (WHERE o."couponCode" IS NOT NULL) AS "coupons"
    FROM "Order" o
    WHERE o."storeId" = ${who.storeId} AND o."status"::text = ANY(${SOLD_STATUS})
      AND (o."placedAt" AT TIME ZONE ${timeZone})::date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1, 2`;
  const out: SalesByTime = { weekday: Array(7).fill(0), hour: Array(24).fill(0), orders: 0, discountMinor: 0, couponOrders: 0 }; // hardcode-ok: empty counters, not a business number
  for (const r of rows) {
    out.weekday[r.dow] = (out.weekday[r.dow] ?? 0) + Number(r.n);
    out.hour[r.h] = (out.hour[r.h] ?? 0) + Number(r.n);
    out.orders += Number(r.n);
    out.discountMinor += Number(r.discount);
    out.couponOrders += Number(r.coupons);
  }
  return out;
}

// ---- saved views and pins -----------------------------------------------------------------------------------------------

const PIN_KEY = 'pin';
const viewInput = z
  .object({
    reportKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
    name: z.string().trim().min(1).max(60),
    params: z.object({ preset: z.enum([...PERIOD_PRESETS, 'custom']), compare: z.boolean(), filters: z.record(z.string().max(40), z.string().max(80)).default({}) }).strict(),
  })
  .strict();
export type SaveViewInput = z.input<typeof viewInput>;

export interface ReportViewRow {
  id: string;
  reportKey: string;
  name: string;
  params: { preset: PeriodPreset | 'custom'; compare: boolean; filters: Record<string, string> };
  createdAt: string;
}

const MAX_VIEWS = 50; // hardcode-ok: a sanity cap on one store's saved views, not a business number

/** The saved views, newest first (`reports.read`). */
export async function listViews(deps: CatalogueDeps, who: Who, reportKey?: string): Promise<ReportViewRow[]> {
  await allowReports(deps, who);
  const rows = await deps.db.reportView.findMany({ where: { storeId: who.storeId, archivedAt: null, reportKey: reportKey ?? { not: PIN_KEY } }, orderBy: { createdAt: 'desc' }, take: MAX_VIEWS });
  return rows.map((r) => ({ id: r.id, reportKey: r.reportKey, name: r.name, params: r.params as ReportViewRow['params'], createdAt: r.createdAt.toISOString() }));
}

/** Saves a view of a report under a name (`reports.read`: a view is the person's own convenience). */
export async function saveView(deps: CatalogueDeps, who: Who, input: SaveViewInput): Promise<ReportViewRow> {
  await allowReports(deps, who);
  const d = parse(viewInput, input, 'view');
  if (d.reportKey === PIN_KEY) throw new CatalogueError('INVALID_INPUT', 'not a report', ['reportKey']);
  const have = await deps.db.reportView.count({ where: { storeId: who.storeId, archivedAt: null, reportKey: { not: PIN_KEY } } });
  if (have >= MAX_VIEWS) throw new CatalogueError('CONFLICT', 'too many saved views; archive one first', ['name']);
  const row = await deps.db.reportView.create({ data: { storeId: who.storeId, reportKey: d.reportKey, name: d.name, params: d.params, createdById: who.actor.staffUserId ?? null } });
  return { id: row.id, reportKey: row.reportKey, name: row.name, params: d.params as ReportViewRow['params'], createdAt: row.createdAt.toISOString() };
}

/** Puts a saved view away (archived, never deleted). */
export async function archiveView(deps: CatalogueDeps, who: Who, id: string): Promise<void> {
  await allowReports(deps, who);
  const r = await deps.db.reportView.updateMany({
    where: { id, storeId: who.storeId, archivedAt: null, reportKey: { not: PIN_KEY } },
    data: { archivedAt: new Date((deps.now ?? (() => new Date()))()) },
  });
  if (r.count === 0) throw new CatalogueError('NOT_FOUND', 'no such view', ['id']);
}

/** The library cards pinned to Home (ids such as "sales", "profit"). */
export async function listPins(deps: CatalogueDeps, who: Who): Promise<string[]> {
  await allowReports(deps, who);
  const rows = await deps.db.reportView.findMany({ where: { storeId: who.storeId, archivedAt: null, reportKey: PIN_KEY }, orderBy: { createdAt: 'asc' }, select: { name: true } });
  return rows.map((r) => r.name);
}

/** Pins or unpins a library card on Home (`reports.read`: the person's own choice of what Home shows). */
export async function setPin(deps: CatalogueDeps, who: Who, cardId: string, pinned: boolean): Promise<string[]> {
  await allowReports(deps, who);
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(cardId)) throw new CatalogueError('INVALID_INPUT', 'not a library card', ['cardId']);
  const where = { storeId: who.storeId, reportKey: PIN_KEY, name: cardId, archivedAt: null };
  const have = await deps.db.reportView.findFirst({ where, select: { id: true } });
  if (pinned && !have) await deps.db.reportView.create({ data: { storeId: who.storeId, reportKey: PIN_KEY, name: cardId, params: {}, createdById: who.actor.staffUserId ?? null } });
  if (!pinned && have) await deps.db.reportView.updateMany({ where, data: { archivedAt: new Date((deps.now ?? (() => new Date()))()) } });
  return listPins(deps, who);
}
