// S06 · PR 164 (register: "Fraud report: what was caught, what was wrong, and the cost avoided"; CN-014 idea 8, the RTO
// cost book by district, campaign, product, courier and reason; CN-017 SIM-F-027, the RTO cost is never understated and
// the book reads real returned parcels only) — Reports › Fraud & RTO.
//
// For a period (the orders by the day they were placed, the returned parcels by the day they came back; with no dates,
// the owner's last `risk.report.days` days):
// - what the risk steps caught — a watch mark (PR 161), the blocklist (PR 162), a repeat refuser's terms (PR 163), a
//   review the risk or duplicate rules opened (PR 519–521, 541), an advance asked (PR 138, 542) — and what became of
//   each: delivered, refused, cancelled, still open;
// - what was wrong: caught, yet delivered all the same; and what was missed: refused, yet never caught;
// - the advances paid, the orders stopped before the courier for a risk reason, and the cost they probably saved — an
//   estimate from the average real cost of a returned parcel in the period, never money that moved;
// - the RTO cost book (rto.ts): the real returned parcels' cost in taka, summed by district, campaign, product, courier
//   and reason, every missing part counted as missing (the total is then a floor). Practice parcels never count.
// The rules are in fraud-report-pure.ts. Needs `risk.report`. Reads only: nothing is blocked, cancelled or charged here.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { BLOCKLIST_FLAG, REFUSER_FLAG, RISK_WATCH_FLAG, refusalKeys } from '@extas/orders';
import { allow, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { avoidedOf, groupRto, tallyCaught, type Avoided, type CaughtTally, type FraudCatch, type ParcelFacts, type RtoGroup, type RtoGroupRow } from './fraud-report-pure';
import { rtoRows, summariseRto, type RtoSummary } from './rto';

/** The timeline types the report reads: an advance asked, and an advance paid. */
const ASKED_EVENT = 'order.awaitAdvance';
const PAID_EVENT = 'order.recordAdvance';
const DAY_MS = 24 * 60 * 60 * 1000;

export const fraudReportQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

export interface FraudReport extends CaughtTally {
  from: Date;
  /** null: up to now. */
  to: Date | null;
  /** Refused at the door, yet caught by no risk step. */
  missed: number;
  avoided: Avoided;
  rto: { real: RtoSummary; groups: Record<RtoGroup, RtoGroupRow[]> };
  /** More orders or parcels than `risk.report.maxRows`: the figures cover the newest ones only. */
  cut: { orders: boolean; parcels: boolean };
  maxRows: number;
}

export async function fraudReport(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<FraudReport> {
  await allow(deps, who, 'risk.report');
  const q = parse(fraudReportQuery, query, 'fraud report query');
  const cfg = await setting(deps, who.storeId, 'risk.report');
  const from = q.from ?? new Date((q.to ?? nowOf(deps)).getTime() - cfg.days * DAY_MS);
  if (q.to && q.to <= from) throw new ShippingError('INVALID_INPUT', 'the period ends before it starts', ['to']);
  const storeId = who.storeId;
  const db = deps.db;

  // ---- what the risk steps caught (orders placed in the period) ----
  // a review is opened after its order lands, so the period's reviews are those opened since its start (at most the size limit)
  const alerted = await db.fraudAlert.findMany({ where: { storeId, createdAt: { gte: from } }, select: { orderId: true }, distinct: ['orderId'], orderBy: { orderId: 'asc' }, take: cfg.maxRows + 1 });
  const alertIds = new Set(alerted.slice(0, cfg.maxRows).map((a) => a.orderId));
  const caughtWhere: Prisma.OrderWhereInput = {
    OR: [{ flags: { hasSome: [RISK_WATCH_FLAG, BLOCKLIST_FLAG, REFUSER_FLAG] } }, { events: { some: { type: ASKED_EVENT } } }, ...(alertIds.size ? [{ id: { in: [...alertIds] } }] : [])],
  };
  const inPeriod: Prisma.OrderWhereInput = { storeId, status: { not: 'DRAFT' }, archivedAt: null, placedAt: { gte: from, ...(q.to ? { lt: q.to } : {}) } };
  const [found, missed] = await Promise.all([
    db.order.findMany({
      where: { AND: [inPeriod, caughtWhere] },
      select: { id: true, status: true, flags: true, handedOverAt: true, cancelReasonCode: true, events: { where: { type: { in: [ASKED_EVENT, PAID_EVENT] } }, select: { type: true } } },
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: cfg.maxRows + 1,
    }),
    db.order.count({ where: { AND: [inPeriod, { status: 'RETURNED' }, { NOT: caughtWhere }] } }),
  ]);
  const orders = found.slice(0, cfg.maxRows);
  const tally = tallyCaught(
    orders.map((o) => {
      const catches: FraudCatch[] = [];
      if (o.flags.includes(RISK_WATCH_FLAG)) catches.push('watch');
      if (o.flags.includes(BLOCKLIST_FLAG)) catches.push('blocklist');
      if (o.flags.includes(REFUSER_FLAG)) catches.push('refuser');
      if (alertIds.has(o.id)) catches.push('review');
      if (o.events.some((e) => e.type === ASKED_EVENT)) catches.push('advance');
      return { status: o.status, catches, handedOver: o.handedOverAt !== null, cancelReasonCode: o.cancelReasonCode, advancePaid: o.events.some((e) => e.type === PAID_EVENT) };
    }),
  );

  // ---- the RTO cost book (real parcels that came back in the period) ----
  const all = await rtoRows(deps, storeId, { from, to: q.to, practice: false, take: cfg.maxRows + 1 });
  const rows = all.slice(0, cfg.maxRows);
  const facts = await parcelFacts(deps, storeId, [...new Set(rows.map((r) => r.orderId))]);

  return {
    from,
    to: q.to ?? null,
    ...tally,
    missed,
    avoided: avoidedOf(tally.stopped, rows, tally.caught.any),
    rto: { real: summariseRto(rows), groups: groupRto(rows, facts) },
    cut: { orders: found.length > cfg.maxRows || alerted.length > cfg.maxRows, parcels: all.length > cfg.maxRows },
    maxRows: cfg.maxRows,
  };
}

/** The district (the order's area, or the district above it), campaign, products and refusal reason of each order. */
async function parcelFacts(deps: ShippingDeps, storeId: number, ids: string[]): Promise<Map<string, ParcelFacts>> {
  if (!ids.length) return new Map();
  const [orders, reasons] = await Promise.all([
    deps.db.order.findMany({
      where: { storeId, id: { in: ids } },
      select: { id: true, areaId: true, utmCampaign: true, items: { where: { status: { not: 'REMOVED' } }, select: { productId: true, productName: true }, orderBy: { createdAt: 'asc' } } },
    }),
    refusalKeys({ db: deps.db, settings: deps.settings }, storeId, ids),
  ]);
  const areaIds = [...new Set(orders.flatMap((o) => (o.areaId ? [o.areaId] : [])))];
  const areas = areaIds.length ? await deps.db.geoArea.findMany({ where: { id: { in: areaIds } }, select: { id: true, level: true, ancestorIds: true, nameEn: true, nameBn: true } }) : [];
  const above = [...new Set(areas.filter((a) => a.level !== 'DISTRICT').flatMap((a) => a.ancestorIds))];
  const districts = above.length ? await deps.db.geoArea.findMany({ where: { id: { in: above }, level: 'DISTRICT' }, select: { id: true, nameEn: true, nameBn: true } }) : [];
  const districtOf = new Map<string, ParcelFacts['district']>();
  for (const a of areas) {
    const d = a.level === 'DISTRICT' ? a : districts.find((x) => a.ancestorIds.includes(x.id));
    districtOf.set(a.id, d ? { key: d.id, name: d.nameEn, nameBn: d.nameBn } : null);
  }
  const out = new Map<string, ParcelFacts>();
  for (const o of orders) {
    const products = new Map<string, string>();
    for (const i of o.items) products.set(i.productId ?? i.productName, i.productName);
    out.set(o.id, {
      district: o.areaId ? (districtOf.get(o.areaId) ?? null) : null,
      campaign: o.utmCampaign?.trim() || null,
      products: [...products].map(([key, name]) => ({ key, name })),
      reason: reasons.get(o.id) ?? null,
    });
  }
  return out;
}
