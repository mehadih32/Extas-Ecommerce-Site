// PR 175 (SIM-F-027; register PR 192's RTO cost book reads it) — what the shop's returned parcels really cost. The book
// reads the shop's OWN returned parcels only: a parcel booked on a courier's practice world (mode MOCK) is never a real
// cost, so it is left out of the real total; with `practice` it is listed beside it, marked, and summed on its own.
// Each parcel's cost is both legs of the courier (the courier's own charge, else the owner's rate card by destination
// and weight; the return charge from the rate card) plus the owner's packaging, handling and ad share (settings
// `delivery.courier.rtoCost`). A part the owner has not entered is named as missing, never counted as zero: the total
// is then a floor, and the book says so. Read only; nothing moves money.
// PR 164: the fraud report (fraud-report.ts) reads the same rows through `rtoRows`, each with its order's id, to sum
// them by district, campaign, product, courier and reason.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, type ShippingDeps, type Who } from './context';
import { requirePermission } from '@extas/auth';
import { campaignOf, RTO_DIMENSIONS, rtoGroups, type RtoDimension, type RtoGroupLine } from './performance-pure';
import { rateFor, rtoCostOf, RTO_PARTS, type RateCardRow, type RtoCost, type RtoPart } from './pure';
import type { Db } from './context';

export const rtoQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** Also list practice parcels (marked, summed apart from the real ones). */
    practice: z.union([z.boolean(), z.enum(['1', '0', 'true', 'false'])]).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

export interface RtoRow {
  shipmentId: string;
  orderNumber: string;
  courier: string;
  providerKey: string;
  /** The order's delivery band (the rate card's zone key). */
  zoneKey: string | null;
  weightGrams: number | null;
  returnedAt: Date | null;
  /** Booked on a practice world: never part of the real total. */
  practice: boolean;
  cost: RtoCost;
  /** PR 164: the order the parcel carried (the fraud report groups by its district, campaign and products). */
  orderId: string;
  /** PR 192 (CN-014 d): the order's district (gazetteer), its campaign (utm, else the channel), why it came back (the
   * reason a person picked on its return record, PR 526) and its pieces — what the book's groups read. */
  district: string | null;
  campaign: string;
  reason: string | null;
  pieces: { product: string; quantity: number }[];
}

export interface RtoSummary {
  parcels: number;
  /** The sum of every known part; while `incomplete` > 0 it is a floor, not the full cost. */
  knownMinor: number;
  incomplete: number;
  /** How many parcels miss each part. */
  missing: Record<RtoPart, number>;
}

const SELECT = {
  id: true,
  courierAccountId: true,
  courierAccount: { select: { name: true, providerKey: true } },
  order: { select: { id: true, number: true, deliveryBand: { select: { key: true } }, areaId: true, utmCampaign: true, source: true, items: { select: { productName: true, quantity: true } } } },
  weightGrams: true,
  chargeMinor: true,
  returnedAt: true,
  mode: true,
} as const;

/** The totals of some RTO rows: parcels, the known cost, how many miss a part and which. */
export function summariseRto(rows: RtoRow[]): RtoSummary {
  const missing = Object.fromEntries(RTO_PARTS.map((p) => [p, 0])) as Record<RtoPart, number>;
  for (const r of rows) for (const p of r.cost.missing) missing[p] += 1;
  return { parcels: rows.length, knownMinor: rows.reduce((s, r) => s + r.cost.knownMinor, 0), incomplete: rows.filter((r) => !r.cost.complete).length, missing };
}

/**
 * PR 192 — the district (the gazetteer's DISTRICT row, in English and Bengali) of each area: the area itself when it is
 * a district, else the district among its ancestors. An area with none is left out.
 */
export async function districtsOf(db: Db, areaIds: readonly string[]): Promise<Map<string, { code: string | null; nameEn: string; nameBn: string | null }>> {
  const ids = [...new Set(areaIds)];
  if (!ids.length) return new Map();
  const areas = await db.geoArea.findMany({ where: { id: { in: ids } }, select: { id: true, level: true, ancestorIds: true } });
  const wanted = new Set<string>();
  for (const a of areas) for (const x of a.level === 'DISTRICT' ? [a.id] : a.ancestorIds) wanted.add(x);
  const districts = await db.geoArea.findMany({ where: { id: { in: [...wanted] }, level: 'DISTRICT' }, select: { id: true, code: true, nameEn: true, nameBn: true } });
  const byId = new Map(districts.map((d) => [d.id, d]));
  const out = new Map<string, { code: string | null; nameEn: string; nameBn: string | null }>();
  for (const a of areas) {
    const d = (a.level === 'DISTRICT' ? [a.id] : a.ancestorIds).map((x) => byId.get(x)).find(Boolean);
    if (d) out.set(a.id, { code: d.code, nameEn: d.nameEn, nameBn: d.nameBn });
  }
  return out;
}

/** The RTO cost book for a period (by the day the parcel came back). */
export async function rtoBook(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<{ rows: RtoRow[]; real: RtoSummary; practice: RtoSummary | null }> {
  await allow(deps, who, 'delivery.parcels');
  return readRtoBook(deps, who.storeId, parse(rtoQuery, query, 'RTO cost query'));
}

async function readRtoBook(deps: Pick<ShippingDeps, 'db' | 'settings'>, storeId: number, q: z.output<typeof rtoQuery>, lang: 'en' | 'bn' = 'en'): Promise<{ rows: RtoRow[]; real: RtoSummary; practice: RtoSummary | null }> {
  const withPractice = q.practice === true || q.practice === '1' || q.practice === 'true';
  const rows = await readRows(deps, storeId, { from: q.from, to: q.to, practice: withPractice, take: q.limit }, lang);
  return { rows, real: summariseRto(rows.filter((r) => !r.practice)), practice: withPractice ? summariseRto(rows.filter((r) => r.practice)) : null };
}

/**
 * The returned parcels of a period (by the day each came back) with their cost, newest first, at most `take`: the real
 * ones (SANDBOX, LIVE) only, or with `practice` the practice ones too. No permission check: each caller checks its own.
 */
export async function rtoRows(deps: Pick<ShippingDeps, 'db' | 'settings'>, storeId: number, q: { from?: Date | undefined; to?: Date | undefined; practice: boolean; take: number }): Promise<RtoRow[]> {
  return readRows(deps, storeId, q, 'en');
}

async function readRows(deps: Pick<ShippingDeps, 'db' | 'settings'>, storeId: number, q: { from?: Date | undefined; to?: Date | undefined; practice: boolean; take: number }, lang: 'en' | 'bn'): Promise<RtoRow[]> {
  const who = { storeId };
  const cfg = await setting(deps, who.storeId, 'delivery.courier.rtoCost');
  const where: Prisma.ShipmentWhereInput = {
    storeId: who.storeId,
    status: 'RETURNED',
    ...(q.from || q.to ? { returnedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
    // a parcel with no mode was never booked through an adapter: not a known cost either
    mode: q.practice ? { not: null } : { in: ['SANDBOX', 'LIVE'] },
  };
  const parcels = await deps.db.shipment.findMany({ where, select: SELECT, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }], take: q.take });
  const accountIds = [...new Set(parcels.map((p) => p.courierAccountId))];
  const cards = await deps.db.courierRateCard.findMany({
    where: { storeId: who.storeId, courierAccountId: { in: accountIds } },
    select: { courierAccountId: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, returnChargeMinor: true, validFrom: true, validTo: true },
  });
  const [districts, reasons] = await Promise.all([
    districtsOf(deps.db, parcels.map((p) => p.order.areaId).filter((x): x is string => Boolean(x))),
    deps.db.returnRecord.findMany({ where: { storeId: who.storeId, shipmentId: { in: parcels.map((p) => p.id) } }, select: { shipmentId: true, reasonCode: true } }),
  ]);
  const reasonOf = new Map(reasons.map((r) => [r.shipmentId!, r.reasonCode]));
  const cardsOf = new Map<string, RateCardRow[]>();
  for (const c of cards) cardsOf.set(c.courierAccountId, [...(cardsOf.get(c.courierAccountId) ?? []), c]);

  return parcels.map((p): RtoRow => {
    const zoneKey = p.order.deliveryBand?.key ?? null;
    const card = rateFor(cardsOf.get(p.courierAccountId) ?? [], { zoneKey, weightGrams: p.weightGrams, at: p.returnedAt ?? new Date(0) });
    const cost = rtoCostOf(
      {
        // the forward leg is always counted: the courier's own charge, else its rate card (SIM-F-027)
        forwardMinor: p.chargeMinor ?? card?.chargeMinor ?? null,
        returnMinor: card?.returnChargeMinor ?? null,
        packagingMinor: cfg.packagingMinor,
        handlingMinor: cfg.handlingMinor,
        adShareMinor: cfg.adShareMinor,
      },
      cfg.count,
    );
    return {
      shipmentId: p.id,
      orderNumber: p.order.number,
      courier: p.courierAccount.name,
      providerKey: p.courierAccount.providerKey,
      zoneKey,
      weightGrams: p.weightGrams,
      returnedAt: p.returnedAt,
      practice: p.mode === 'MOCK',
      cost,
      orderId: p.order.id,
      district: ((d) => (d ? (lang === 'bn' && d.nameBn) || d.nameEn : null))(p.order.areaId ? districts.get(p.order.areaId) : undefined),
      campaign: campaignOf(p.order),
      reason: reasonOf.get(p.id) ?? null,
      pieces: p.order.items.map((i) => ({ product: i.productName, quantity: i.quantity })),
    };
  });
}

/**
 * PR 192 (CN-014 d, REP-06; SIM-F-027) — the RTO cost book on Reports › Delivery & RTO: the shop's own returned parcels
 * of the period (practice parcels never), grouped by district, campaign, product, courier and reason. Seeing it needs
 * `reports.read`; while the owner's switch (`delivery.courier.rtoBook`) is off it answers `enabled: false` and reads
 * nothing. No sample rows, ever. Read only.
 */
export async function rtoReport(
  deps: Pick<ShippingDeps, 'db' | 'settings'>,
  who: Who,
  query: { from?: Date; to?: Date; lang?: 'en' | 'bn'; limit?: number } = {},
): Promise<{ enabled: false } | { enabled: true; summary: RtoSummary; groups: Record<RtoDimension, RtoGroupLine[]>; cut: boolean }> {
  await requirePermission(deps.db, who.actor, 'reports.read', { storeId: who.storeId });
  if (!(await setting(deps, who.storeId, 'delivery.courier.rtoBook')).enabled) return { enabled: false };
  const limit = query.limit ?? 500;
  const book = await readRtoBook(deps, who.storeId, parse(rtoQuery, { from: query.from, to: query.to, limit }, 'RTO cost query'), query.lang ?? 'en');
  const groups = Object.fromEntries(RTO_DIMENSIONS.map((d) => [d, rtoGroups(book.rows, d)])) as Record<RtoDimension, RtoGroupLine[]>;
  return { enabled: true, summary: book.real, groups, cut: book.rows.length >= limit };
}
