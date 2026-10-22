// PR 104 — combo analytics: which sets sell and which colour pairs customers pick. Counted as they happen, one row per
// combo per day in the shop's time zone (ComboDailyStat: page views, sets added to bags, colour picks on the page) and
// one row per colour combination of a combo (PopularPair, `colourKey` = its colours sorted: how often that exact pair
// went into a bag — the "popular pairs" row learns from it, PR 94). Orders, sets sold, sales and what customers saved
// are read from the order lines (OrderItem.comboId + comboGroupKey: one set per group) when the report is opened, so a
// cancelled or returned order never counts as a sale. Counters are written with one SQL upsert each, safe when many
// customers add at once.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registry } from '@extas/settings';
import { allow, checkStoreId, nowOf, parse, setting, type CombosDeps, type Db, type Who } from './context';
import { ymdIn } from './model';

/** Orders in these states are not sales (never placed, called off, or sent back). */
const NOT_SOLD = ['DRAFT', 'CANCELLED', 'RETURNED'] as const;
const DAY_MS = 86_400_000;

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

export interface ComboReportRow {
  comboId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  views: number;
  adds: number;
  picks: number;
  setsSold: number;
  orders: number;
  salesMinor: number;
  /** What customers saved against buying the pieces separately. */
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
  totals: { views: number; adds: number; picks: number; setsSold: number; orders: number; salesMinor: number; savedMinor: number };
  /** The best combos: most sets sold, then most added. */
  top: ComboReportRow[];
  /** The colour pairs picked most (all time: the popular-pairs row learns from all of it). */
  pairs: PairReportRow[];
  /** Day by day, oldest first. */
  series: { day: string; views: number; adds: number; setsSold: number }[];
}

/** The combo report for the last `days` days (default `combos.report.defaultDays`), best `combos.report.topCount`. */
export async function comboReport(deps: CombosDeps, who: Who, input: { days?: number } = {}): Promise<ComboReport> {
  await allow(deps, who, 'combos.read');
  const [defaultDays, topCount, timeZone] = await Promise.all([setting(deps, who.storeId, 'combos.report.defaultDays'), setting(deps, who.storeId, 'combos.report.topCount'), setting(deps, who.storeId, 'store.timeZone')]);
  const days = input.days === undefined ? defaultDays : parse(registry['combos.report.defaultDays'].schema, input.days, 'report');
  const now = nowOf(deps);
  const to = ymdIn(now, timeZone);
  const from = ymdIn(new Date(now.getTime() - (days - 1) * DAY_MS), timeZone);
  const fromDay = new Date(`${from}T00:00:00Z`);
  const toDay = new Date(`${to}T00:00:00Z`);
  const storeId = who.storeId;

  const [stats, lines, pairRows] = await Promise.all([
    deps.db.comboDailyStat.findMany({ where: { storeId, day: { gte: fromDay, lte: toDay } }, select: { comboId: true, day: true, views: true, adds: true, picks: true } }),
    deps.db.orderItem.findMany({
      where: { storeId, comboId: { not: null }, comboGroupKey: { not: null }, status: 'ACTIVE', order: { status: { notIn: [...NOT_SOLD] }, placedAt: { gte: new Date(fromDay.getTime() - DAY_MS), lte: new Date(now.getTime() + DAY_MS) } } },
      select: { comboId: true, comboGroupKey: true, orderId: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, order: { select: { placedAt: true } } },
    }),
    deps.db.popularPair.findMany({ where: { storeId, colourKey: { not: null }, pickCount: { gt: 0 } }, orderBy: [{ pickCount: 'desc' }, { updatedAt: 'desc' }], take: topCount, select: { comboId: true, colourIds: true, pickCount: true } }),
  ]);
  // Order lines inside the window by the shop's own calendar day.
  const sold = lines.filter((l) => {
    const d = ymdIn(l.order.placedAt, timeZone);
    return d >= from && d <= to;
  });

  const rows = new Map<string, ComboReportRow & { groups: Set<string>; orderIds: Set<string> }>();
  const row = (comboId: string) => {
    let r = rows.get(comboId);
    if (!r) rows.set(comboId, (r = { comboId, slug: '', nameEn: '', nameBn: null, status: '', views: 0, adds: 0, picks: 0, setsSold: 0, orders: 0, salesMinor: 0, savedMinor: 0, groups: new Set(), orderIds: new Set() }));
    return r;
  };
  const series = new Map<string, { day: string; views: number; adds: number; setsSold: number }>();
  for (let t = fromDay.getTime(); t <= toDay.getTime(); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    series.set(day, { day, views: 0, adds: 0, setsSold: 0 });
  }
  for (const s of stats) {
    const r = row(s.comboId);
    r.views += s.views;
    r.adds += s.adds;
    r.picks += s.picks;
    const day = series.get(s.day.toISOString().slice(0, 10));
    if (day) {
      day.views += s.views;
      day.adds += s.adds;
    }
  }
  const seenSet = new Set<string>();
  for (const l of sold) {
    const r = row(l.comboId!);
    const set = `${l.orderId}/${l.comboGroupKey}`;
    r.groups.add(set);
    r.orderIds.add(l.orderId);
    r.salesMinor += l.lineTotalMinor;
    r.savedMinor += Math.max(0, l.unitPriceMinor * l.quantity - l.lineTotalMinor);
    if (!seenSet.has(set)) {
      seenSet.add(set);
      const day = series.get(ymdIn(l.order.placedAt, timeZone));
      if (day) day.setsSold += 1;
    }
  }
  const comboIds = [...new Set([...rows.keys(), ...pairRows.map((p) => p.comboId)])];
  const combos = await deps.db.combo.findMany({ where: { storeId, id: { in: comboIds } }, select: { id: true, slug: true, nameEn: true, nameBn: true, status: true } });
  const comboOf = new Map(combos.map((c) => [c.id, c]));
  const all = [...rows.values()].map(({ groups, orderIds, ...r }) => {
    const c = comboOf.get(r.comboId);
    return { ...r, slug: c?.slug ?? '', nameEn: c?.nameEn ?? '', nameBn: c?.nameBn ?? null, status: c?.status ?? '', setsSold: groups.size, orders: orderIds.size };
  });
  const totals = all.reduce(
    (t, r) => ({ views: t.views + r.views, adds: t.adds + r.adds, picks: t.picks + r.picks, setsSold: t.setsSold + r.setsSold, orders: t.orders, salesMinor: t.salesMinor + r.salesMinor, savedMinor: t.savedMinor + r.savedMinor }),
    { views: 0, adds: 0, picks: 0, setsSold: 0, orders: new Set(sold.map((l) => l.orderId)).size, salesMinor: 0, savedMinor: 0 },
  );
  const top = all
    .filter((r) => r.setsSold || r.adds || r.views)
    .sort((a, b) => b.setsSold - a.setsSold || b.adds - a.adds || b.views - a.views || a.slug.localeCompare(b.slug))
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
