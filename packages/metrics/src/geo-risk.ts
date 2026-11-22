// S29 · PR 758 (CN-054; register "Geography map: risk lens") — where parcels come back and where trouble starts, area by
// area, for a period (the store's own days). Per area, from the shop's own records, counts only (never a name or a phone):
//   - Return hotspots: delivered, returned, the return rate (the rules of Sales by area, PR 568: returned ÷ (delivered +
//     returned)), and the flag `returnHotspot` = at least `minOrders` settled orders and a rate over `warnReturnPct`;
//   - COD refusals at the door, counted as Delivery & RTO counts them (PR 192): a parcel the customer refused at the door
//     is the customer's, not the shop's fault (`refusedAtDoor`); one the shop was at fault for is counted apart
//     (`refusedOurFault`), never inside the first;
//   - cancelled orders (on their cancelled day) and, beside the rows, the reasons (`orders.cancel` reason keys; a key the
//     owner later removed still counts under its own name);
//   - fraud and risk areas: orders placed in the period that the risk score (PR 156–164) put in its top band, as a count
//     and a share of the scored ones; the flag `riskArea` = at least `minOrders` scored and a share over `warnReturnPct`;
//   - claims (courier claims, PR 192, by the day raised) and support tickets (S08, by the day opened), put in the area
//     of their order. A ticket with no order has no area and is counted in `extras.ticketsWithoutOrder`.
// Each part is read only when the viewer's permission for its own source report allows it (`parts`); a part left out is
// `null` in every row and named in `hidden`. Hotspots are advice for a person to read: nothing here blocks an order, a
// COD rule, a courier or a customer. Read-only, store-scoped, archived orders left out.
import { returnedWhere } from './channels';
import { basisWhere, practiceVisible, type Db } from './metrics';
import { daysPeriod } from './pure';
import { bump, byFigure, loadPlaces, ratio, Roller, rowsOf, type Counts, type LensPlace, type LensResult } from './geo-lens-base';
import type { GeoLevel } from './geo-types';

/** The parts of the risk lens; the web layer turns on the ones the viewer's permissions allow. */
export const RISK_PARTS = ['returns', 'refusals', 'cancels', 'risk', 'claims', 'tickets'] as const;
export type RiskPart = (typeof RISK_PARTS)[number];

export interface RiskOptions {
  timeZone: string;
  level: GeoLevel;
  parentAreaId?: string | null;
  /** The setting `reports.geoMap.minOrders`. */
  minOrders: number;
  /** The setting `reports.geoMap.warnReturnPct` (per cent). */
  warnReturnPct: number;
  /** The key of the risk score's top band (`risk.bands`, the last one); null when the owner has none: no risk figures. */
  topBandKey: string | null;
  /** Which parts the viewer may see. */
  parts: ReadonlySet<RiskPart>;
}

/** The records of the period, each already put in its order's area (null = none). */
export interface RiskRecords {
  delivered: { areaId: string | null }[];
  returned: { areaId: string | null }[];
  refused: { areaId: string | null; ourFault: boolean }[];
  cancelled: { areaId: string | null; reason: string | null }[];
  scored: { areaId: string | null; band: string | null }[];
  claims: { areaId: string | null }[];
  tickets: { areaId: string | null }[];
  ticketsWithoutOrder: number;
}

const KEYS = ['delivered', 'returned', 'refusedAtDoor', 'refusedOurFault', 'cancelled', 'scored', 'highRisk', 'claims', 'tickets'] as const;
const zero = (): Counts => Object.fromEntries(KEYS.map((k) => [k, 0]));

/** A reason key that was not given. */
export const NO_REASON = '(none)';

const topReasons = (m: ReadonlyMap<string, number>) => [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

/** The lens from the records (pure: the tests run it without a database). */
export function buildRisk(places: ReadonlyMap<string, LensPlace>, rec: RiskRecords, o: RiskOptions, days: { from: string; to: string }): LensResult {
  const roller = new Roller<Counts>(o.level, o.parentAreaId ?? null, places, zero);
  const add = (areaId: string | null, key: (typeof KEYS)[number]) => {
    for (const f of roller.at(areaId)) bump(f, key);
  };
  const reasonsAll = new Map<string, number>();
  const reasonsBy = new Map<string, Map<string, number>>();
  for (const r of rec.delivered) add(r.areaId, 'delivered');
  for (const r of rec.returned) add(r.areaId, 'returned');
  for (const r of rec.refused) add(r.areaId, r.ourFault ? 'refusedOurFault' : 'refusedAtDoor');
  for (const r of rec.cancelled) {
    add(r.areaId, 'cancelled');
    const key = r.reason ?? NO_REASON;
    const row = roller.keyOf(r.areaId);
    if (!roller.at(r.areaId).length) continue; // under a drill-down parent, an order elsewhere is not counted
    reasonsAll.set(key, (reasonsAll.get(key) ?? 0) + 1);
    if (row) {
      const m = reasonsBy.get(row) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + 1);
      reasonsBy.set(row, m);
    }
  }
  for (const r of rec.scored) {
    add(r.areaId, 'scored');
    if (o.topBandKey !== null && r.band === o.topBandKey) add(r.areaId, 'highRisk');
  }
  for (const r of rec.claims) add(r.areaId, 'claims');
  for (const r of rec.tickets) add(r.areaId, 'tickets');

  const warn = o.warnReturnPct / 100;
  const has = (p: RiskPart) => o.parts.has(p);
  const figures = (f: Counts): Record<string, number | null> => {
    const settled = f.delivered! + f.returned!;
    const refusedTotal = f.refusedAtDoor! + f.refusedOurFault!;
    return {
      delivered: has('returns') ? f.delivered! : null,
      returned: has('returns') ? f.returned! : null,
      settled: has('returns') ? settled : null,
      returnRate: has('returns') ? ratio(f.returned!, settled) : null,
      refusedAtDoor: has('refusals') ? f.refusedAtDoor! : null,
      refusedOurFault: has('refusals') ? f.refusedOurFault! : null,
      refusedShareOfReturns: has('refusals') ? ratio(refusedTotal, f.returned!) : null,
      cancelled: has('cancels') ? f.cancelled! : null,
      scored: has('risk') && o.topBandKey !== null ? f.scored! : null,
      highRisk: has('risk') && o.topBandKey !== null ? f.highRisk! : null,
      highRiskShare: has('risk') && o.topBandKey !== null ? ratio(f.highRisk!, f.scored!) : null,
      claims: has('claims') ? f.claims! : null,
      tickets: has('tickets') ? f.tickets! : null,
    };
  };
  const flags = (f: Counts, fig: Record<string, number | null>): string[] => {
    const out: string[] = [];
    if (has('returns') && f.delivered! + f.returned! >= o.minOrders && (fig.returnRate ?? 0) > warn) out.push('returnHotspot');
    if (has('risk') && o.topBandKey !== null && f.scored! >= o.minOrders && (fig.highRiskShare ?? 0) > warn) out.push('riskArea');
    return out;
  };

  const rows = rowsOf(roller, figures, flags, byFigure('returnRate'));
  const hidden = RISK_PARTS.filter((p) => !has(p) || (p === 'risk' && o.topBandKey === null));
  const reasonsByArea: Record<string, { key: string; count: number }[]> = {};
  for (const [id, m] of reasonsBy) reasonsByArea[id] = topReasons(m);
  return {
    level: o.level,
    days,
    rows,
    unknown: figures(roller.unknown),
    outside: figures(roller.outside),
    total: figures(roller.total),
    extras: { cancelReasons: has('cancels') ? topReasons(reasonsAll) : null, cancelReasonsByArea: has('cancels') ? reasonsByArea : null, ticketsWithoutOrder: has('tickets') ? rec.ticketsWithoutOrder : null },
    hidden,
  };
}

/** The risk lens of one store over the days `from`–`to`. */
export async function geoRisk(db: Db, storeId: number, days: { from: string; to: string }, o: RiskOptions): Promise<LensResult> {
  const period = daysPeriod(days.from, days.to, o.timeZone);
  const has = (p: RiskPart) => o.parts.has(p);
  const none = <T>() => Promise.resolve([] as T[]);
  const [delivered, returned, refused, cancelled, scored, claims, tickets] = await Promise.all([
    has('returns') ? db.$queryRaw<{ areaId: string | null }[]>`SELECT o."areaId" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}` : none<{ areaId: string | null }>(),
    has('returns') ? db.$queryRaw<{ areaId: string | null }[]>`SELECT o."areaId" FROM "Order" o WHERE ${returnedWhere(storeId, period)}` : none<{ areaId: string | null }>(),
    has('refusals')
      ? db.$queryRaw<{ areaId: string | null; ourFault: boolean }[]>`
          SELECT o."areaId", r."ourFault" FROM "ReturnRecord" r JOIN "Order" o ON o."id" = r."orderId"
           WHERE r."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND r."kind"::text = 'REFUSED_AT_DOOR'
             AND r."createdAt" >= ${period.from} AND r."createdAt" < ${period.to}`
      : none<{ areaId: string | null; ourFault: boolean }>(),
    has('cancels')
      ? db.$queryRaw<{ areaId: string | null; reason: string | null }[]>`
          SELECT o."areaId", o."cancelReasonCode" AS "reason" FROM "Order" o
           WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND o."status"::text = 'CANCELLED'
             AND o."cancelledAt" >= ${period.from} AND o."cancelledAt" < ${period.to}`
      : none<{ areaId: string | null; reason: string | null }>(),
    has('risk') && o.topBandKey !== null
      ? db.$queryRaw<{ areaId: string | null; band: string | null }[]>`
          SELECT o."areaId", o."riskBand" AS "band" FROM "Order" o
           WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND o."status"::text <> 'DRAFT' AND o."riskScore" IS NOT NULL
             AND o."placedAt" >= ${period.from} AND o."placedAt" < ${period.to}`
      : none<{ areaId: string | null; band: string | null }>(),
    has('claims')
      ? db.$queryRaw<{ areaId: string | null }[]>`
          SELECT o."areaId" FROM "CourierClaim" c JOIN "Order" o ON o."id" = c."orderId"
           WHERE c."storeId" = ${storeId} AND c."isPractice" = false AND o."archivedAt" IS NULL AND c."createdAt" >= ${period.from} AND c."createdAt" < ${period.to}`
      : none<{ areaId: string | null }>(),
    has('tickets')
      ? db.$queryRaw<{ areaId: string | null; hasOrder: boolean }[]>`
          SELECT o."areaId", (t."orderId" IS NOT NULL) AS "hasOrder" FROM "Ticket" t LEFT JOIN "Order" o ON o."id" = t."orderId" AND o."storeId" = t."storeId"
           WHERE t."storeId" = ${storeId} AND t."createdAt" >= ${period.from} AND t."createdAt" < ${period.to}`
      : none<{ areaId: string | null; hasOrder: boolean }>(),
  ]);
  const withOrder = tickets.filter((t) => t.hasOrder);
  const rec: RiskRecords = { delivered, returned, refused, cancelled, scored, claims, tickets: withOrder, ticketsWithoutOrder: tickets.length - withOrder.length };
  const ids = [...delivered, ...returned, ...refused, ...cancelled, ...scored, ...claims, ...withOrder].map((r) => r.areaId).filter((x): x is string => !!x);
  if (o.parentAreaId) ids.push(o.parentAreaId);
  return buildRisk(await loadPlaces(db, ids), rec, o, days);
}
