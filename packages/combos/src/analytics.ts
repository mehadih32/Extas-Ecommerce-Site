// PR 104 — combo analytics: which sets sell and which colour pairs customers pick. Counted as they happen, one row per
// combo per day in the shop's time zone (ComboDailyStat: page views, sets added to bags, colour picks on the page) and
// one row per colour combination of a combo (PopularPair, `colourKey` = its colours sorted: how often that exact pair
// went into a bag — the "popular pairs" row learns from it, PR 94). Orders, sets ordered, Ordered value, Sales and what
// customers saved are read from the order lines (OrderItem.comboId + comboGroupKey: one set per group) when the report
// is opened, through @extas/metrics — the shop's one KPI definition (PR 155, CN-022): Sales = delivered orders only, on
// the delivered day; Ordered value = every placed order, on the placed day, shown beside it. Counters are written with
// one SQL upsert each, safe when many customers add at once.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { daysBetween, groupLines, lastDays, linesBoth, sumLines, type LineRow } from '@extas/metrics';
import { registry } from '@extas/settings';
import { allow, checkStoreId, nowOf, parse, setting, type CombosDeps, type Db, type Who } from './context';
import { ymdIn } from './model';

/** The day row a moment falls on, in the shop's time zone (a DATE column holds the calendar day). */
const dayOf = (at: Date, timeZone: string) => new Date(`${ymdIn(at, timeZone)}T00:00:00Z`);

/** The colours of a set as one key (sorted), so the same pair in any order counts on one row. */
export const colourKeyOf = (colourIds: readonly (string | null)[]): string | null => {
  const ids = colourIds.filter((x): x is string => Boolean(x)).sort();
  return ids.length ? ids.join('+') : null;
};

type Counter = 'views' | 'adds' | 'picks';

async function bump(db: Db, storeId: number, comboId: string, day: Date, field: Counter): Promise<void> {
  // One statement per counter (the column name is one of three fixed names, never from input).
  const id = randomUUID();
  if (field === 'views')
    await db.$executeRaw`INSERT INTO "ComboDailyStat" ("id","storeId","comboId","day","views","updatedAt") VALUES (${id}::uuid, ${storeId}, ${comboId}::uuid, ${day}::date, 1, now()) ON CONFLICT ("comboId","day") DO UPDATE SET "views" = "ComboDailyStat"."views" + 1, "updatedAt" = now()`;
  else if (field === 'adds')
    await db.$executeRaw`INSERT INTO "ComboDailyStat" ("id","storeId","comboId","day","adds","updatedAt") VALUES (${id}::uuid, ${storeId}, ${comboId}::uuid, ${day}::date, 1, now()) ON CONFLICT ("comboId","day") DO UPDATE SET "adds" = "ComboDailyStat"."adds" + 1, "updatedAt" = now()`;
  else
    await db.$executeRaw`INSERT INTO "ComboDailyStat" ("id","storeId","comboId","day","picks","updatedAt") VALUES (${id}::uuid, ${storeId}, ${comboId}::uuid, ${day}::date, 1, now()) ON CONFLICT ("comboId","day") DO UPDATE SET "picks" = "ComboDailyStat"."picks" + 1, "updatedAt" = now()`;
}

async function bumpPair(db: Db, storeId: number, comboId: string, colourIds: readonly (string | null)[]): Promise<void> {
  const key = colourKeyOf(colourIds);
  if (!key) return;
  const ids = key.split('+');
  await db.$executeRaw`INSERT INTO "PopularPair" ("id","storeId","comboId","colourIds","colourKey","pickCount","updatedAt") VALUES (${randomUUID()}::uuid, ${storeId}, ${comboId}::uuid, ${ids}::uuid[], ${key}, 1, now()) ON CONFLICT ("comboId","colourKey") DO UPDATE SET "pickCount" = "PopularPair"."pickCount" + 1, "updatedAt" = now()`;
}

const eventSchema = z.object({ storeId: z.int().min(1), comboId: z.uuid(), colourIds: z.array(z.uuid().nullable()).max(20).optional() }).strict();
export type ComboEventInput = z.input<typeof eventSchema>;

async function known(db: Db, storeId: number, comboId: string): Promise<boolean> {
  return Boolean(await db.combo.findFirst({ where: { id: comboId, storeId }, select: { id: true } }));
}

/** A combo page was opened (the storefront calls it; an unknown combo is ignored). */
export async function recordComboView(deps: CombosDeps, input: ComboEventInput): Promise<void> {
  const d = parse(eventSchema, input, 'event');
  if (!(await known(deps.db, d.storeId, d.comboId))) return;
  await bump(deps.db, d.storeId, d.comboId, dayOf(nowOf(deps), await setting(deps, d.storeId, 'store.timeZone')), 'views');
}

/** A customer picked a full set of colours on the page (before adding). */
export async function recordColourPick(deps: CombosDeps, input: ComboEventInput): Promise<void> {
  const d = parse(eventSchema, input, 'event');
  if (!(await known(deps.db, d.storeId, d.comboId))) return;
  await bump(deps.db, d.storeId, d.comboId, dayOf(nowOf(deps), await setting(deps, d.storeId, 'store.timeZone')), 'picks');
}

/** A set went into a bag (PR 97 calls it inside its own write): one add, and its colour pair counted. */
export async function recordSetAdded(deps: CombosDeps, db: Db, e: { storeId: number; comboId: string; colourIds: readonly (string | null)[]; at: Date }): Promise<void> {
  checkStoreId(e.storeId);
  await bump(db, e.storeId, e.comboId, dayOf(e.at, await setting(deps, e.storeId, 'store.timeZone')), 'adds');
  await bumpPair(db, e.storeId, e.comboId, e.colourIds);
}

// ---------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------

/** One combo's numbers in the window. Money and orders come from @extas/metrics (the one KPI definition, PR 155). */
export interface ComboReportRow {
  comboId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  views: number;
  adds: number;
  picks: number;
  /** Sets in placed orders (one set per order line group), on the day the order was placed. */
  setsOrdered: number;
  /** Placed orders holding a set of this combo. */
  orders: number;
  /** Ordered value: the set lines of every placed order, on the placed day. */
  orderedMinor: number;
  /** Sales: the set lines of delivered orders only, on the delivered day. */
  salesMinor: number;
  /** Delivered orders holding a set of this combo. */
  salesOrders: number;
  /** What customers saved on the ordered sets against buying the pieces separately. */
  savedMinor: number;
}

export interface PairReportRow {
  comboId: string;
  comboNameEn: string;
  comboNameBn: string | null;
  colours: { id: string; nameEn: string; nameBn: string | null; hex: string }[];
  picks: number;
}

export interface ComboReport {
  days: number;
  from: string;
  to: string;
  totals: { views: number; adds: number; picks: number; setsOrdered: number; orders: number; orderedMinor: number; salesMinor: number; salesOrders: number; savedMinor: number };
  /** The best combos: most sets ordered, then most added. */
  top: ComboReportRow[];
  /** The colour pairs picked most (all time: the popular-pairs row learns from all of it). */
  pairs: PairReportRow[];
  /** Day by day, oldest first. */
  series: { day: string; views: number; adds: number; setsOrdered: number }[];
}

/** Sets in a group of order lines: one set per order and set key. */
const setsIn = (rows: readonly LineRow[]) => new Set(rows.map((l) => `${l.orderId}/${l.comboGroupKey}`)).size;

/** The combo report for the last `days` days (default `combos.report.defaultDays`), best `combos.report.topCount`. */
export async function comboReport(deps: CombosDeps, who: Who, input: { days?: number } = {}): Promise<ComboReport> {
  await allow(deps, who, 'combos.read');
  const [defaultDays, topCount, timeZone] = await Promise.all([setting(deps, who.storeId, 'combos.report.defaultDays'), setting(deps, who.storeId, 'combos.report.topCount'), setting(deps, who.storeId, 'store.timeZone')]);
  const days = input.days === undefined ? defaultDays : parse(registry['combos.report.defaultDays'].schema, input.days, 'report');
  const { from, to, period } = lastDays(days, nowOf(deps), timeZone);
  const storeId = who.storeId;

  const [stats, sets, pairRows] = await Promise.all([
    deps.db.comboDailyStat.findMany({ where: { storeId, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, select: { comboId: true, day: true, views: true, adds: true, picks: true } }),
    // Set lines by the one KPI definition: Ordered value on the placed day, Sales on the delivered day.
    linesBoth(deps.db, storeId, period, timeZone, { combos: true }),
    deps.db.popularPair.findMany({ where: { storeId, colourKey: { not: null }, pickCount: { gt: 0 } }, orderBy: [{ pickCount: 'desc' }, { updatedAt: 'desc' }], take: topCount, select: { comboId: true, colourIds: true, pickCount: true } }),
  ]);

  const events = new Map<string, { views: number; adds: number; picks: number }>();
  const series = new Map(daysBetween(from, to).map((day) => [day, { day, views: 0, adds: 0, setsOrdered: 0 }]));
  for (const s of stats) {
    const e = events.get(s.comboId) ?? { views: 0, adds: 0, picks: 0 };
    e.views += s.views;
    e.adds += s.adds;
    e.picks += s.picks;
    events.set(s.comboId, e);
    const day = series.get(s.day.toISOString().slice(0, 10));
    if (day) {
      day.views += s.views;
      day.adds += s.adds;
    }
  }
  for (const [day, rows] of groupLines(sets.ordered, (l) => l.day)) {
    const d = series.get(day);
    if (d) d.setsOrdered += setsIn(rows);
  }

  const ordered = groupLines(sets.ordered, (l) => l.comboId);
  const sold = groupLines(sets.sales, (l) => l.comboId);
  const comboIds = [...new Set([...events.keys(), ...ordered.keys(), ...sold.keys(), ...pairRows.map((p) => p.comboId)])];
  const combos = await deps.db.combo.findMany({ where: { storeId, id: { in: comboIds } }, select: { id: true, slug: true, nameEn: true, nameBn: true, status: true } });
  const comboOf = new Map(combos.map((c) => [c.id, c]));
  const all: ComboReportRow[] = [...new Set([...events.keys(), ...ordered.keys(), ...sold.keys()])].map((comboId) => {
    const c = comboOf.get(comboId);
    const e = events.get(comboId) ?? { views: 0, adds: 0, picks: 0 };
    const o = sumLines(ordered.get(comboId) ?? []);
    const s = sumLines(sold.get(comboId) ?? []);
    return {
      comboId,
      slug: c?.slug ?? '',
      nameEn: c?.nameEn ?? '',
      nameBn: c?.nameBn ?? null,
      status: c?.status ?? '',
      ...e,
      setsOrdered: setsIn(ordered.get(comboId) ?? []),
      orders: o.orders,
      orderedMinor: o.valueMinor,
      salesMinor: s.valueMinor,
      salesOrders: s.orders,
      savedMinor: o.savedMinor,
    };
  });
  const o = sumLines(sets.ordered);
  const s = sumLines(sets.sales);
  const totals = {
    views: all.reduce((n, r) => n + r.views, 0),
    adds: all.reduce((n, r) => n + r.adds, 0),
    picks: all.reduce((n, r) => n + r.picks, 0),
    setsOrdered: setsIn(sets.ordered),
    orders: o.orders,
    orderedMinor: o.valueMinor,
    salesMinor: s.valueMinor,
    salesOrders: s.orders,
    savedMinor: o.savedMinor,
  };
  const top = all
    .filter((r) => r.setsOrdered || r.salesOrders || r.adds || r.views)
    .sort((a, b) => b.setsOrdered - a.setsOrdered || b.adds - a.adds || b.views - a.views || a.slug.localeCompare(b.slug))
    .slice(0, topCount);

  const colourIds = [...new Set(pairRows.flatMap((p) => p.colourIds))];
  const colours = await deps.db.colour.findMany({ where: { storeId, id: { in: colourIds } }, select: { id: true, nameEn: true, nameBn: true, hex: true } });
  const colourOf = new Map(colours.map((c) => [c.id, c]));
  const pairs = pairRows.map((p) => {
    const c = comboOf.get(p.comboId);
    return { comboId: p.comboId, comboNameEn: c?.nameEn ?? '', comboNameBn: c?.nameBn ?? null, colours: p.colourIds.flatMap((id) => (colourOf.has(id) ? [colourOf.get(id)!] : [])), picks: p.pickCount };
  });
  return { days, from, to, totals, top, pairs, series: [...series.values()] };
}
