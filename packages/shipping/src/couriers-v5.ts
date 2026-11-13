// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-01..C-15) — the Couriers section and Courier 360, read only.
// `couriersOverview`: one card per courier (parcels on the way and the cash they will collect, the last 30 days'
// success, days to deliver and cost per parcel, parcels that have not moved, the default courier first) and, while the
// courier choice by cost is on (`delivery.courier.selection`), "money we would save with per-area routing" for the 30 days
// (the delivery charges paid against the cheapest courier's rate-card cost for each parcel, never a guess: a parcel with
// no rate-card cost anywhere is left out and counted). `courierDetail`: one courier's header and its eight weeks of
// success. `courierParcels`: its parcels with a state filter, paged. Practice parcels (the courier's practice world) are
// never counted in a figure; they are counted aside. Nothing is booked, moved or paid here (`delivery.read`).
import { z } from 'zod';
import { allow, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { listCouriers, type CourierAccountView } from './accounts';
import { courierChoicesOf } from './courier-choice';
import { ShippingError } from './errors';
import { ACTIVE_STATES, EXCEPTION_STATUSES } from './pure';

const DAY = 86_400_000;
/** Success is counted over this many days (the prototype's 30). */
export const COURIER_WINDOW_DAYS = 30;
/** Courier 360's week-by-week line. */
export const COURIER_WEEKS = 8;
/** How many parcels the savings line looks at (the newest finished ones). */
const SAVINGS_PARCELS = 200;
const FINISHED = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'] as const;
const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;
const REAL = ['SANDBOX', 'LIVE'] as const;

export interface FinishedParcel {
  status: string;
  /** deliveredAt, else returnedAt */
  endedAt: Date;
  pickedAt: Date | null;
  bookedAt: Date | null;
  chargeMinor: number | null;
}

export interface CourierFigures {
  delivered: number;
  returned: number;
  finished: number;
  /** delivered / finished in percent, one decimal; null with nothing finished. */
  successPct: number | null;
  /** Average days from pick-up to delivery over the delivered parcels; null with none. */
  avgDays: number | null;
  /** Delivery charges the courier reported over the finished parcels, and how many parcels that is. */
  costMinor: number;
  costParcels: number;
  /** costMinor / costParcels, rounded; null with no reported charge. */
  perParcelMinor: number | null;
}

const pct1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** The figures of a courier's finished parcels (pure). */
export function courierFigures(parcels: readonly FinishedParcel[]): CourierFigures {
  const ok = parcels.filter((p) => (DELIVERED as readonly string[]).includes(p.status));
  const bad = parcels.filter((p) => p.status === 'RETURNED');
  const days = ok.map((p) => (p.endedAt.getTime() - (p.pickedAt ?? p.bookedAt ?? p.endedAt).getTime()) / DAY).filter((d) => d >= 0);
  const charged = parcels.filter((p) => p.chargeMinor !== null);
  const costMinor = charged.reduce((s, p) => s + (p.chargeMinor ?? 0), 0);
  return {
    delivered: ok.length,
    returned: bad.length,
    finished: ok.length + bad.length,
    successPct: pct1(ok.length, ok.length + bad.length),
    avgDays: days.length ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : null,
    costMinor,
    costParcels: charged.length,
    perParcelMinor: charged.length ? Math.round(costMinor / charged.length) : null,
  };
}

export interface WeekPoint {
  /** The week's first day (the day `weeks` ago, counted back from `now`), as an ISO date. */
  from: string;
  delivered: number;
  finished: number;
  successPct: number | null;
}

/** Week-by-week success, oldest first, the last week ending at `now` (pure). */
export function weeklySuccess(parcels: readonly FinishedParcel[], now: Date, weeks = COURIER_WEEKS): WeekPoint[] {
  const out: WeekPoint[] = Array.from({ length: weeks }, (_, i) => ({ from: new Date(now.getTime() - (weeks - i) * 7 * DAY).toISOString().slice(0, 10), delivered: 0, finished: 0, successPct: null }));
  for (const p of parcels) {
    const back = Math.floor((now.getTime() - p.endedAt.getTime()) / (7 * DAY));
    const w = out[weeks - 1 - back];
    if (back < 0 || !w) continue;
    w.finished += 1;
    if ((DELIVERED as readonly string[]).includes(p.status)) w.delivered += 1;
  }
  for (const w of out) w.successPct = pct1(w.delivered, w.finished);
  return out;
}

const finishedSelect = { status: true, deliveredAt: true, returnedAt: true, pickedAt: true, bookedAt: true, chargeMinor: true, courierAccountId: true } as const;

function toFinished(r: { status: string; deliveredAt: Date | null; returnedAt: Date | null; pickedAt: Date | null; bookedAt: Date | null; chargeMinor: number | null }): FinishedParcel | null {
  const endedAt = r.deliveredAt ?? r.returnedAt;
  return endedAt ? { status: r.status, endedAt, pickedAt: r.pickedAt, bookedAt: r.bookedAt, chargeMinor: r.chargeMinor } : null;
}

export interface CourierCard extends CourierAccountView {
  isDefault: boolean;
  isBackup: boolean;
  onTheWay: { parcels: number; codMinor: number };
  /** Parcels with the courier that have not moved for the owner's hours (0 while the alert is off). */
  stuck: number;
  last30: CourierFigures;
  /** Practice parcels of the window, never counted in the figures above. */
  practiceParcels: number;
}

export interface Savings {
  /** The courier choice by cost is off: there is no line to show. */
  enabled: boolean;
  /** What the 30 days' delivery charges were over the cheapest courier's cost, summed; null when nothing could be compared. */
  savedMinor: number | null;
  /** Parcels compared, and parcels left out because no courier had a rate-card cost for them. */
  compared: number;
  leftOut: number;
}

export interface CouriersOverview {
  cards: CourierCard[];
  defaultCourierId: string | null;
  savings: Savings;
  watch: { stuckAlert: boolean; stuckHours: number; backupCourierId: string };
}

/** The default courier first, the rest as they were (pure). */
export function defaultFirst<T extends { id: string }>(list: readonly T[], defaultId: string): T[] {
  const i = list.findIndex((c) => c.id === defaultId);
  return i <= 0 ? [...list] : [list[i]!, ...list.slice(0, i), ...list.slice(i + 1)];
}

export async function couriersOverview(deps: ShippingDeps, who: Who): Promise<CouriersOverview> {
  await allow(deps, who, 'delivery.read');
  const storeId = who.storeId;
  const now = nowOf(deps);
  const [{ couriers }, setup, watch, selection] = await Promise.all([
    listCouriers(deps, who),
    setting(deps, storeId, 'delivery.couriers'),
    setting(deps, storeId, 'fulfilment.courierWatch'),
    setting(deps, storeId, 'delivery.courier.selection'),
  ]);
  const live = couriers.filter((c) => !c.archived);
  const since = new Date(now.getTime() - COURIER_WINDOW_DAYS * DAY);
  const inWindow = { OR: [{ deliveredAt: { gte: since } }, { deliveredAt: null, returnedAt: { gte: since } }] };
  const [finished, practice, onWay, lastMoves] = await Promise.all([
    deps.db.shipment.findMany({ where: { storeId, status: { in: [...FINISHED] }, mode: { in: [...REAL] }, ...inWindow }, select: finishedSelect, take: 20_000 }),
    deps.db.shipment.groupBy({ by: ['courierAccountId'], where: { storeId, mode: 'MOCK', ...inWindow, status: { in: [...FINISHED] } }, _count: { _all: true } }),
    deps.db.shipment.groupBy({ by: ['courierAccountId'], where: { storeId, status: { in: [...ACTIVE_STATES] } }, _count: { _all: true }, _sum: { codAmountMinor: true } }),
    watch.stuckAlert
      ? deps.db.shipment.findMany({
          where: { storeId, status: { in: [...ACTIVE_STATES] }, order: { archivedAt: null } },
          select: { courierAccountId: true, pickedAt: true, bookedAt: true, events: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true } } },
          take: 2_000,
        })
      : Promise.resolve([]),
  ]);
  const limit = watch.stuckHours * 3_600_000;
  const stuckBy = new Map<string, number>();
  for (const s of lastMoves) {
    const moved = s.events[0]?.occurredAt ?? s.pickedAt ?? s.bookedAt;
    if (moved && now.getTime() - moved.getTime() > limit) stuckBy.set(s.courierAccountId, (stuckBy.get(s.courierAccountId) ?? 0) + 1);
  }
  const cards: CourierCard[] = defaultFirst(live, setup.defaultCourierId || live[0]?.id || '').map((c) => ({
    ...c,
    isDefault: c.id === (setup.defaultCourierId || live[0]?.id),
    isBackup: !!watch.backupCourierId && c.id === watch.backupCourierId,
    onTheWay: { parcels: onWay.find((x) => x.courierAccountId === c.id)?._count._all ?? 0, codMinor: onWay.find((x) => x.courierAccountId === c.id)?._sum.codAmountMinor ?? 0 },
    stuck: stuckBy.get(c.id) ?? 0,
    last30: courierFigures(
      finished
        .filter((r) => r.courierAccountId === c.id)
        .map(toFinished)
        .filter((x): x is FinishedParcel => x !== null),
    ),
    practiceParcels: practice.find((x) => x.courierAccountId === c.id)?._count._all ?? 0,
  }));
  return { cards, defaultCourierId: setup.defaultCourierId || live[0]?.id || null, savings: await routingSavings(deps, who, selection.enabled, since), watch };
}

/** "Money we would save with per-area routing": see the file header. Never throws on a missing rate card. */
async function routingSavings(deps: ShippingDeps, who: Who, enabled: boolean, since: Date): Promise<Savings> {
  if (!enabled) return { enabled: false, savedMinor: null, compared: 0, leftOut: 0 };
  const rows = await deps.db.shipment.findMany({
    where: {
      storeId: who.storeId,
      status: { in: [...FINISHED] },
      mode: { in: [...REAL] },
      chargeMinor: { not: null },
      OR: [{ deliveredAt: { gte: since } }, { deliveredAt: null, returnedAt: { gte: since } }],
    },
    select: { orderId: true, chargeMinor: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SAVINGS_PARCELS,
  });
  if (!rows.length) return { enabled: true, savedMinor: null, compared: 0, leftOut: 0 };
  const choices = await courierChoicesOf(deps, who, [...new Set(rows.map((r) => r.orderId))]);
  const byOrder = new Map(choices.map((c) => [c.orderId, c]));
  let saved = 0;
  let compared = 0;
  let leftOut = 0;
  for (const r of rows) {
    const best = byOrder.get(r.orderId)?.costs.find((c) => c.costMinor !== null)?.costMinor ?? null;
    if (best === null) {
      leftOut += 1;
      continue;
    }
    compared += 1;
    saved += Math.max(0, (r.chargeMinor ?? 0) - best);
  }
  return { enabled: true, savedMinor: compared ? saved : null, compared, leftOut };
}

export interface CourierDetail {
  courier: CourierCard;
  weekly: WeekPoint[];
  /** Exception parcels with the courier now (attempt failed, address, lost, damaged). */
  exceptions: number;
}

export async function courierDetail(deps: ShippingDeps, who: Who, courierId: string): Promise<CourierDetail> {
  const ov = await couriersOverview(deps, who);
  const courier = ov.cards.find((c) => c.id === courierId);
  if (!courier) throw new ShippingError('NOT_FOUND', 'no such courier account', ['courierId']);
  const now = nowOf(deps);
  const since = new Date(now.getTime() - COURIER_WEEKS * 7 * DAY);
  const [rows, exceptions] = await Promise.all([
    deps.db.shipment.findMany({
      where: {
        storeId: who.storeId,
        courierAccountId: courierId,
        status: { in: [...FINISHED] },
        mode: { in: [...REAL] },
        OR: [{ deliveredAt: { gte: since } }, { deliveredAt: null, returnedAt: { gte: since } }],
      },
      select: finishedSelect,
      take: 20_000,
    }),
    deps.db.shipment.count({ where: { storeId: who.storeId, courierAccountId: courierId, status: { in: [...EXCEPTION_STATUSES] } } }),
  ]);
  return {
    courier,
    weekly: weeklySuccess(
      rows.map(toFinished).filter((x): x is FinishedParcel => x !== null),
      now,
    ),
    exceptions,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Parcels

export const PARCEL_FILTERS = ['all', 'onTheWay', 'delivered', 'returned', 'problem'] as const;
export type ParcelFilter = (typeof PARCEL_FILTERS)[number];
const FILTER_STATUS: Record<Exclude<ParcelFilter, 'all'>, readonly string[]> = {
  onTheWay: ACTIVE_STATES.filter((s) => !(EXCEPTION_STATUSES as readonly string[]).includes(s)),
  delivered: DELIVERED,
  returned: ['RETURNED', 'RETURNING'],
  problem: EXCEPTION_STATUSES,
};

export const PARCEL_PAGE = 30;
const parcelsQuery = z.object({ filter: z.enum(PARCEL_FILTERS).default('all'), page: z.coerce.number().int().min(1).max(10_000).default(1) }).strict();

export interface CourierParcelRow {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  consignmentId: string | null;
  status: string;
  providerStatus: string | null;
  codMinor: number;
  collectedMinor: number | null;
  chargeMinor: number | null;
  bookedAt: string | null;
  movedAt: string | null;
  deliveredAt: string | null;
  practice: boolean;
}

export interface CourierParcels {
  rows: CourierParcelRow[];
  counts: Record<ParcelFilter, number>;
  filter: ParcelFilter;
  page: number;
  pages: number;
}

export async function courierParcels(deps: ShippingDeps, who: Who, courierId: string, input: unknown = {}): Promise<CourierParcels> {
  await allow(deps, who, 'delivery.read');
  const q = parse(parcelsQuery, input, 'courier parcels');
  const storeId = who.storeId;
  if (!(await deps.db.courierAccount.findFirst({ where: { id: courierId, storeId }, select: { id: true } }))) throw new ShippingError('NOT_FOUND', 'no such courier account', ['courierId']);
  const base = { storeId, courierAccountId: courierId, status: { notIn: ['BOOKING', 'BOOKING_FAILED', 'CANCELLED'] as never[] } };
  const where = q.filter === 'all' ? base : { ...base, status: { in: [...FILTER_STATUS[q.filter]] as never[] } };
  const [counts, total, rows] = await Promise.all([
    Promise.all(PARCEL_FILTERS.map((f) => deps.db.shipment.count({ where: f === 'all' ? base : { ...base, status: { in: [...FILTER_STATUS[f]] as never[] } } }))),
    deps.db.shipment.count({ where }),
    deps.db.shipment.findMany({
      where,
      orderBy: [{ bookedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      skip: (q.page - 1) * PARCEL_PAGE,
      take: PARCEL_PAGE,
      select: {
        id: true,
        orderId: true,
        consignmentId: true,
        status: true,
        providerStatus: true,
        codAmountMinor: true,
        codCollectedMinor: true,
        chargeMinor: true,
        bookedAt: true,
        pickedAt: true,
        deliveredAt: true,
        mode: true,
        order: { select: { number: true } },
        events: { orderBy: { occurredAt: 'desc' }, take: 1, select: { occurredAt: true } },
      },
    }),
  ]);
  return {
    rows: rows.map((s) => ({
      shipmentId: s.id,
      orderId: s.orderId,
      orderNumber: s.order.number,
      consignmentId: s.consignmentId,
      status: s.status,
      providerStatus: s.providerStatus,
      codMinor: s.codAmountMinor,
      collectedMinor: s.codCollectedMinor,
      chargeMinor: s.chargeMinor,
      bookedAt: s.bookedAt?.toISOString() ?? null,
      movedAt: (s.events[0]?.occurredAt ?? s.pickedAt ?? s.bookedAt)?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      practice: s.mode === 'MOCK',
    })),
    counts: Object.fromEntries(PARCEL_FILTERS.map((f, i) => [f, counts[i]!])) as Record<ParcelFilter, number>,
    filter: q.filter,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / PARCEL_PAGE)),
  };
}
