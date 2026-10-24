// PR 175 (SIM-F-027; register PR 192's RTO cost book reads it) — what the shop's returned parcels really cost. The book
// reads the shop's OWN returned parcels only: a parcel booked on a courier's practice world (mode MOCK) is never a real
// cost, so it is left out of the real total; with `practice` it is listed beside it, marked, and summed on its own.
// Each parcel's cost is both legs of the courier (the courier's own charge, else the owner's rate card by destination
// and weight; the return charge from the rate card) plus the owner's packaging, handling and ad share (settings
// `delivery.courier.rtoCost`). A part the owner has not entered is named as missing, never counted as zero: the total
// is then a floor, and the book says so. Read only; nothing moves money.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, type ShippingDeps, type Who } from './context';
import { rateFor, rtoCostOf, RTO_PARTS, type RateCardRow, type RtoCost, type RtoPart } from './pure';

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
  order: { select: { number: true, deliveryBand: { select: { key: true } } } },
  weightGrams: true,
  chargeMinor: true,
  returnedAt: true,
  mode: true,
} as const;

function summarise(rows: RtoRow[]): RtoSummary {
  const missing = Object.fromEntries(RTO_PARTS.map((p) => [p, 0])) as Record<RtoPart, number>;
  for (const r of rows) for (const p of r.cost.missing) missing[p] += 1;
  return { parcels: rows.length, knownMinor: rows.reduce((s, r) => s + r.cost.knownMinor, 0), incomplete: rows.filter((r) => !r.cost.complete).length, missing };
}

/** The RTO cost book for a period (by the day the parcel came back). */
export async function rtoBook(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<{ rows: RtoRow[]; real: RtoSummary; practice: RtoSummary | null }> {
  await allow(deps, who, 'delivery.parcels');
  const q = parse(rtoQuery, query, 'RTO cost query');
  const withPractice = q.practice === true || q.practice === '1' || q.practice === 'true';
  const cfg = await setting(deps, who.storeId, 'delivery.courier.rtoCost');
  const where: Prisma.ShipmentWhereInput = {
    storeId: who.storeId,
    status: 'RETURNED',
    ...(q.from || q.to ? { returnedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}),
    // a parcel with no mode was never booked through an adapter: not a known cost either
    mode: withPractice ? { not: null } : { in: ['SANDBOX', 'LIVE'] },
  };
  const parcels = await deps.db.shipment.findMany({ where, select: SELECT, orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }], take: q.limit });
  const accountIds = [...new Set(parcels.map((p) => p.courierAccountId))];
  const cards = await deps.db.courierRateCard.findMany({
    where: { storeId: who.storeId, courierAccountId: { in: accountIds } },
    select: { courierAccountId: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, returnChargeMinor: true, validFrom: true, validTo: true },
  });
  const cardsOf = new Map<string, RateCardRow[]>();
  for (const c of cards) cardsOf.set(c.courierAccountId, [...(cardsOf.get(c.courierAccountId) ?? []), c]);

  const rows: RtoRow[] = parcels.map((p) => {
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
    };
  });
  return { rows, real: summarise(rows.filter((r) => !r.practice)), practice: withPractice ? summarise(rows.filter((r) => r.practice)) : null };
}
