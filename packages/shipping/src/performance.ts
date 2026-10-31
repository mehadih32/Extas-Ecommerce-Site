// PR 192 — the courier performance report (BACKEND-ARCHITECTURE §5 REP-06 "courier performance", DLV-05a "performance
// by zone"; SIM-F-017, SIM-F-018). The shop's own finished parcels of a period (the day each was delivered or came
// back; practice parcels never, unless asked and then apart): per courier, per courier and delivery band, per district —
// delivered, on time against the band's promise, came back, refused at the door (not the shop's fault), and the
// exceptions they went through (a failed try, an address problem, lost, damaged). Beside it the parcels still with a
// courier and already past their promise now (the same list as Delivery's late view). Read only; nothing moves.
import { requirePermission, type PermissionKey } from '@extas/auth';
import { z } from 'zod';
import { checkStoreId, parse, setting, type ShippingDeps, type Who } from './context';
import { orderPromises, promiseDueBy } from '@extas/delivery/promise';
import { lateParcelIds } from './parcels';
import { groupPerf, perfLine, type ExceptionStatus, type PerfLine, type PerfParcel } from './performance-pure';
import { EXCEPTION_STATUSES } from './pure';
import { districtsOf } from './rto';

export const performanceQuery = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    courierAccountId: z.uuid().optional(),
    /** The district names in Bengali where the gazetteer has them. */
    lang: z.enum(['en', 'bn']).default('en'),
    /** How many late parcels are listed (all are counted). */
    lateRows: z.coerce.number().int().min(0).max(200).default(20),
  })
  .strict()
  .refine((q) => q.from.getTime() < q.to.getTime(), { message: 'from must be before to', path: ['from'] });

export interface LateRow {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  courier: string;
  status: string;
  dueBy: Date | null;
}

export interface CourierPerformance {
  total: PerfLine;
  byCourier: PerfLine[];
  /** Courier × delivery band ("performance by zone"). */
  byZone: PerfLine[];
  byDistrict: PerfLine[];
  /** Parcels with a courier now and past their promise plus the grace hours (all counted; the oldest order first,
   * `lateRows` listed; `dueBy` is the promise itself). */
  lateNow: { count: number; rows: LateRow[] };
  /** Practice parcels of the period, never counted above. */
  practiceLeftOut: number;
  graceHours: number;
}

/** At most this many finished parcels are read for one report (a longer period says it was cut). */
export const PERFORMANCE_MAX_PARCELS = 20_000;

const FINISHED = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'] as const;
const REFUSED_KINDS = ['REFUSED_AT_DOOR', 'CHARGE_PAID_RETURN'] as const;

/**
 * The report for a period. Seeing it needs `reports.read` (Reports › Delivery & RTO) or, for one courier's own page,
 * `delivery.read` (Delivery › Couriers › the courier).
 */
export async function courierPerformance(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, who: Who, query: unknown, permission: Extract<PermissionKey, 'reports.read' | 'delivery.read'> = 'reports.read'): Promise<CourierPerformance & { cut: boolean }> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const q = parse(performanceQuery, query, 'performance query');
  const storeId = who.storeId;
  const graceHours = (await setting(deps, storeId, 'account.track.late')).graceHours;
  const inPeriod = { gte: q.from, lt: q.to };
  const base = { storeId, status: { in: [...FINISHED] }, ...(q.courierAccountId ? { courierAccountId: q.courierAccountId } : {}), OR: [{ deliveredAt: inPeriod }, { deliveredAt: null, returnedAt: inPeriod }] };
  const [parcels, practiceLeftOut] = await Promise.all([
    deps.db.shipment.findMany({
      where: { ...base, mode: { in: ['SANDBOX', 'LIVE'] } },
      select: {
        id: true,
        status: true,
        deliveredAt: true,
        courierAccountId: true,
        courierAccount: { select: { name: true } },
        order: { select: { id: true, placedAt: true, addressUnclear: true, areaId: true, deliveryBand: { select: { key: true, nameEn: true, nameBn: true, hoursMin: true, hoursMax: true } } } },
      },
      orderBy: { id: 'asc' },
      take: PERFORMANCE_MAX_PARCELS + 1,
    }),
    deps.db.shipment.count({ where: { ...base, mode: 'MOCK' } }),
  ]);
  const cut = parcels.length > PERFORMANCE_MAX_PARCELS;
  const rows = cut ? parcels.slice(0, PERFORMANCE_MAX_PARCELS) : parcels;
  const ids = rows.map((p) => p.id);
  // review R3 (customer M2/M3): on time against the promise the checkout gave (district hours, the holiday break, Eid)
  const promises = await orderPromises(deps, storeId, rows.map((p) => ({ id: p.order.id, placedAt: p.order.placedAt, areaId: p.order.areaId, band: p.order.deliveryBand })));
  const [events, refusals, districts] = await Promise.all([
    ids.length ? deps.db.shipmentEvent.findMany({ where: { storeId, shipmentId: { in: ids }, status: { in: [...EXCEPTION_STATUSES] } }, select: { shipmentId: true, status: true }, distinct: ['shipmentId', 'status'] }) : [],
    ids.length ? deps.db.returnRecord.findMany({ where: { storeId, shipmentId: { in: ids }, kind: { in: [...REFUSED_KINDS] }, ourFault: false }, select: { shipmentId: true } }) : [],
    districtsOf(deps.db, rows.map((p) => p.order.areaId).filter((x): x is string => Boolean(x))),
  ]);
  const exceptionsOf = new Map<string, ExceptionStatus[]>();
  for (const e of events) exceptionsOf.set(e.shipmentId, [...(exceptionsOf.get(e.shipmentId) ?? []), e.status as ExceptionStatus]);
  const refused = new Set(refusals.map((r) => r.shipmentId));
  const bn = q.lang === 'bn';

  const facts: PerfParcel[] = rows.map((p) => {
    const band = p.order.deliveryBand;
    const d = p.order.areaId ? districts.get(p.order.areaId) : undefined;
    return {
      courierAccountId: p.courierAccountId,
      courier: p.courierAccount.name,
      zoneKey: band?.key ?? null,
      zoneName: band ? (bn && band.nameBn) || band.nameEn : null,
      district: d ? (bn && d.nameBn) || d.nameEn : null,
      status: p.status,
      placedAt: promises.get(p.order.id)?.from ?? p.order.placedAt,
      deliveredAt: p.deliveredAt,
      hoursMax: promiseDueBy(promises.get(p.order.id)) ? (promises.get(p.order.id)?.hoursMax ?? null) : null,
      addressUnclear: p.order.addressUnclear,
      refused: refused.has(p.id),
      exceptions: exceptionsOf.get(p.id) ?? [],
    };
  });

  const late = await lateNow(deps, storeId, q.courierAccountId, q.lateRows);
  return {
    total: perfLine('all', '', facts, graceHours),
    byCourier: groupPerf(facts, (p) => ({ key: p.courierAccountId, label: p.courier }), graceHours),
    byZone: groupPerf(facts, (p) => ({ key: `${p.courierAccountId}:${p.zoneKey ?? '-'}`, label: `${p.courier} · ${p.zoneName ?? '—'}` }), graceHours),
    byDistrict: groupPerf(facts, (p) => (p.district ? { key: p.district, label: p.district } : null), graceHours, { key: '-', label: '—' }),
    lateNow: late,
    practiceLeftOut,
    graceHours,
    cut,
  };
}

/** SIM-F-018 — the parcels with a courier now and past their promise: counted, the oldest promise first. */
async function lateNow(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number, courierAccountId: string | undefined, take: number): Promise<{ count: number; rows: LateRow[] }> {
  const ids = await lateParcelIds(deps, storeId);
  if (!ids.length) return { count: 0, rows: [] };
  const where = { storeId, id: { in: ids }, ...(courierAccountId ? { courierAccountId } : {}) };
  const [count, list] = await Promise.all([
    deps.db.shipment.count({ where }),
    take
      ? deps.db.shipment.findMany({
          where,
          select: { id: true, orderId: true, status: true, courierAccount: { select: { name: true } }, order: { select: { id: true, number: true, placedAt: true, areaId: true, deliveryBand: { select: { key: true, hoursMin: true, hoursMax: true } } } } },
          orderBy: [{ order: { placedAt: 'asc' } }, { id: 'asc' }],
          take,
        })
      : [],
  ]);
  const promises = await orderPromises(deps, storeId, list.map((s) => ({ id: s.order.id, placedAt: s.order.placedAt, areaId: s.order.areaId, band: s.order.deliveryBand })));
  return {
    count,
    rows: list.map((s) => {
      return {
        shipmentId: s.id,
        orderId: s.orderId,
        orderNumber: s.order.number,
        courier: s.courierAccount.name,
        status: s.status,
        dueBy: promiseDueBy(promises.get(s.order.id)),
      };
    }),
  };
}
