// S28 · PR 689 (admin prototype v5, Reports › Report library) — the library's admin API. Every route signs the person in
// (guardAdmin with `reports.read`, in the store `?storeId=`, default the mother store); @extas/catalogue checks it again.
//
//   GET   /api/admin/reports/library?preset=month   the cards for the period (and the span before it), the restock and unsold
//                                                   lists, sales by weekday and hour, last month's review facts, the saved
//                                                   views and the pins
//   POST  /api/admin/reports/library                {action: 'pin', cardId, pinned} · {action: 'save-view', reportKey, name,
//                                                   params} · {action: 'archive-view', id}
// Read-only reports: nothing here moves money or changes anything but the person's own views and pins.
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import * as inv from '@extas/inventory';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { sellableReader } from './shop/sellable';

export type CardKind = 'money' | 'count';
export interface LibraryCard {
  id: string;
  group: 'sales' | 'products';
  kind: CardKind;
  /** Null = not known (e.g. profit while the ad spend is missing). */
  now: number | null;
  /** The span before it, when it can be told. */
  prev: number | null;
  change: number | null;
}

/** The facts of last month's review, as numbers only (the screen writes the sentences). */
export interface ReviewFacts {
  from: string;
  to: string;
  salesMinor: number;
  salesChange: number | null;
  netProfitMinor: number | null;
  profitChange: number | null;
  orders: number;
  busiestWeekday: number | null;
  restockStyles: number;
}

const PRESET = new Set<string>(cat.PERIOD_PRESETS);

/** The period a request asks for: your own dates (`from` and `to`) or a preset (`preset` or `period`), else `fallback`; null when it is not valid. */
export function periodOf(url: URL, fallback: cat.PeriodPreset): cat.PeriodPreset | cat.PeriodRange | null {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from !== null || to !== null) return cat.customRange(from ?? '', to ?? '');
  const preset = url.searchParams.get('preset') ?? url.searchParams.get('period') ?? fallback;
  return PRESET.has(preset) ? (preset as cat.PeriodPreset) : null;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const card = (id: string, group: LibraryCard['group'], kind: CardKind, now: number | null, prev: number | null): LibraryCard => ({
  id,
  group,
  kind,
  now,
  prev,
  change: now === null || prev === null ? null : cat.changePct(now, prev),
});

/** Pure: the library's cards from the two spans' profit figures and the lists. */
export function libraryCards(
  a: { sales: number; net: number | null; orders: number },
  b: { sales: number; net: number | null; orders: number },
  restock: number,
  unsold: number,
  discountMinor: number,
): LibraryCard[] {
  const aov = (x: { sales: number; orders: number }) => (x.orders > 0 ? Math.round(x.sales / x.orders) : null);
  return [
    card('sales', 'sales', 'money', a.sales, b.sales),
    card('profit', 'sales', 'money', a.net, b.net),
    card('orders', 'sales', 'count', a.orders, b.orders),
    card('aov', 'sales', 'money', aov(a), aov(b)),
    card('discount', 'sales', 'money', discountMinor, null),
    card('restock', 'products', 'count', restock, null),
    card('unsold', 'products', 'count', unsold, null),
  ];
}

/** Everything the library shows, for one store and one period. */
export async function libraryScreen(admin: AdminDeps, who: inv.Who, period: cat.PeriodPreset | cat.PeriodRange) {
  const idep = await inventoryDeps(admin);
  const cdep: cat.CatalogueDeps = { db: admin.db, settings: admin.resolver, now: admin.now, sellable: sellableReader(admin.db, admin.resolver, who.storeId) };
  const tz = await admin.resolver.value('store.timeZone', { storeId: who.storeId });
  const now = (admin.now ?? (() => new Date()))();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const r = typeof period === 'string' ? cat.periodRange(period, today) : period;
  const lm = cat.periodRange('lastmonth', today);
  const [pa, pb, restock, time, timeLm, lmA, lmB, views, pins] = await Promise.all([
    inv.profitReport(idep, who.storeId, r.from, r.to),
    inv.profitReport(idep, who.storeId, r.prevFrom, r.prevTo),
    cat.restockReport(cdep, who),
    cat.salesByTime(cdep, who, r),
    cat.salesByTime(cdep, who, lm),
    inv.profitReport(idep, who.storeId, lm.from, lm.to),
    inv.profitReport(idep, who.storeId, lm.prevFrom, lm.prevTo),
    cat.listViews(cdep, who),
    cat.listPins(cdep, who),
  ]);
  const cards = libraryCards(
    { sales: pa.salesMinor, net: pa.netProfitMinor, orders: pa.orders },
    { sales: pb.salesMinor, net: pb.netProfitMinor, orders: pb.orders },
    restock.restock.length,
    restock.unsold.length,
    time.discountMinor,
  );
  const peak = timeLm.weekday.reduce((best, n, i) => (n > (timeLm.weekday[best] ?? 0) ? i : best), 0);
  const review: ReviewFacts = {
    from: lm.from,
    to: lm.to,
    salesMinor: lmA.salesMinor,
    salesChange: cat.changePct(lmA.salesMinor, lmB.salesMinor),
    netProfitMinor: lmA.netProfitMinor,
    profitChange: lmA.netProfitMinor === null || lmB.netProfitMinor === null ? null : cat.changePct(lmA.netProfitMinor, lmB.netProfitMinor),
    orders: lmA.orders,
    busiestWeekday: timeLm.orders > 0 ? peak : null,
    restockStyles: restock.restock.length,
  };
  return { range: r, cards, restock, time, review, views, pins };
}

export async function libraryHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  try {
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    if (m === 'GET') {
      const period = periodOf(url, 'month');
      if (period === null) return fail(400, 'INVALID_INPUT', ['preset']);
      return json({ ok: true, ...(await libraryScreen(deps!, who, period)) });
    }
    const cdep: cat.CatalogueDeps = { db: deps!.db, settings: deps!.resolver, now: deps!.now };
    const b = await body(request);
    if (b.action === 'pin') return json({ ok: true, pins: await cat.setPin(cdep, who, String(b.cardId ?? ''), b.pinned === true) });
    if (b.action === 'save-view') return json({ ok: true, view: await cat.saveView(cdep, who, { reportKey: b.reportKey, name: b.name, params: b.params } as cat.SaveViewInput) }, { status: 201 });
    if (b.action === 'archive-view') {
      if (!isUuid(b.id)) return fail(400, 'INVALID_INPUT', ['id']);
      await cat.archiveView(cdep, who, b.id);
      return json({ ok: true });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
