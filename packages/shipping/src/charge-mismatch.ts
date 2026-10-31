// S08 · PR 564 (Blueprint §60.13, D3.12 point 6 as replaced on 18 Oct; demo 92-admin-couriers.js "Band mismatch log";
// SIM-F-003) — the charge mismatch log. A courier says what it charged for a parcel (its booking answer, a tracking read,
// or its COD statement); that charge is looked up on the courier's own rate cards (Delivery › Couriers, the cards the
// cost-based courier choice uses) at the parcel's weight. When the charge fits exactly one band's card, and that band
// is not the one the customer paid for, the courier read the place as another band: the case is written down once
// (`ChargeMismatch`), with the shop's own charge of both bands and the gap.
//
// - Nothing else happens: the order, its delivery charge and the parcel are never touched, nobody is messaged, no
//   correction is offered (the gap is ৳50 at most and the cases are rare; correcting would cost more in refused
//   parcels). The owner decides later from the monthly number (Reports › Delivery & RTO).
// - Never guessed: no charge, no rate card, no weight where the cards need one, a charge that fits no card or several
//   bands, or the paid band itself among the fits — nothing is written. Practice parcels are left out.
// - A free delivery is recorded with no gap (the customer paid nothing either way).
// - Off as shipped (`delivery.chargeMismatch`); one row per parcel, written once (the table is append-only).
import { requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { parcelWeight, rateFor, type RateCardRow } from './pure';

/** Where the courier's charge was read. */
export const MISMATCH_SOURCES = ['booking', 'tracking', 'statement'] as const;
export type MismatchSource = (typeof MISMATCH_SOURCES)[number];

/** What one look at a parcel's charge came to. */
export type MismatchCheck = 'off' | 'practice' | 'noCharge' | 'noBand' | 'unread' | 'same' | 'already' | 'recorded';

type Card = RateCardRow & { codFeeBps: number | null };

/**
 * The bands whose card at this weight gives the courier's charge — its plain charge, or the charge with its COD fee on
 * the amount collected (a statement often shows both together). Each band once, in the cards' order.
 */
export function bandsForCharge(cards: readonly Card[], q: { chargeMinor: number; weightGrams: number | null; collectMinor: number; at: Date }): string[] {
  const out: string[] = [];
  for (const zoneKey of new Set(cards.map((c) => c.zoneKey))) {
    const card = rateFor(cards, { zoneKey, weightGrams: q.weightGrams, at: q.at }) as Card | null;
    if (!card) continue;
    const fee = card.codFeeBps && q.collectMinor > 0 ? Math.round((q.collectMinor * card.codFeeBps) / 10_000) : 0; // as courierCostMinor
    if (card.chargeMinor === q.chargeMinor || card.chargeMinor + fee === q.chargeMinor) out.push(zoneKey);
  }
  return out;
}

/** The band the courier read, when its charge fits exactly one band and that band is not the paid one; else null. */
export function courierReadBand(paidBandKey: string, fits: readonly string[]): string | null {
  if (fits.length !== 1 || fits[0] === paidBandKey) return null;
  return fits[0]!;
}

/** The gap the log shows: what the courier's band costs the customer more (+) or less (−); nothing on a free delivery. */
export function mismatchGap(q: { paidBandMinor: number; courierBandMinor: number; freeDelivery: boolean }): number {
  return q.freeDelivery ? 0 : q.courierBandMinor - q.paidBandMinor;
}

/** The parcel's weight from its pieces (null when any piece has none). */
async function itemsWeight(deps: Pick<ShippingDeps, 'db'>, items: readonly { quantity: number; variantId: string | null }[]): Promise<number | null> {
  const ids = [...new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))];
  const weights = new Map((await deps.db.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, weightGrams: true } })).map((v) => [v.id, v.weightGrams]));
  return parcelWeight(items.map((i) => ({ productName: '', colourName: null, sizeLabel: null, quantity: i.quantity, weightGrams: i.variantId ? (weights.get(i.variantId) ?? null) : null })));
}

/**
 * Looks at one parcel's charge and writes the case when the courier read another band (`source`: where the charge
 * was read). `statementChargeMinor`: the charge of the courier's statement line, which wins over the parcel's own.
 * Safe to call any number of times and outside any person's request (a booking, a tracking run, a statement import).
 */
export async function noteCourierCharge(
  deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>,
  ref: { storeId: number; shipmentId: string },
  source: MismatchSource,
  opts: { statementChargeMinor?: number | null } = {},
): Promise<MismatchCheck> {
  const { storeId, shipmentId } = ref;
  if (!(await setting(deps, storeId, 'delivery.chargeMismatch')).enabled) return 'off';
  if (await deps.db.chargeMismatch.findUnique({ where: { shipmentId }, select: { id: true } })) return 'already';
  const s = await deps.db.shipment.findFirst({
    where: { id: shipmentId, storeId },
    select: {
      id: true,
      orderId: true,
      courierAccountId: true,
      mode: true,
      chargeMinor: true,
      codAmountMinor: true,
      weightGrams: true,
      bookedAt: true,
      createdAt: true,
      order: {
        select: {
          deliveryChargeMinor: true,
          deliveryBand: { select: { key: true, chargeMinor: true } },
          items: { where: { status: 'ACTIVE' }, select: { quantity: true, variantId: true } },
        },
      },
    },
  });
  if (!s) return 'noCharge';
  if (s.mode !== 'SANDBOX' && s.mode !== 'LIVE') return 'practice';
  const statement = opts.statementChargeMinor && opts.statementChargeMinor > 0 ? opts.statementChargeMinor : null;
  const chargeMinor = statement ?? (s.chargeMinor && s.chargeMinor > 0 ? s.chargeMinor : null);
  if (chargeMinor === null) return 'noCharge';
  const paid = s.order.deliveryBand;
  if (!paid) return 'noBand';
  const at = s.bookedAt ?? s.createdAt;
  const weightGrams = s.weightGrams ?? (await itemsWeight(deps, s.order.items));
  const cards = await deps.db.courierRateCard.findMany({
    where: { storeId, courierAccountId: s.courierAccountId },
    select: { zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, codFeeBps: true, returnChargeMinor: true, validFrom: true, validTo: true },
  });
  const fits = bandsForCharge(cards, { chargeMinor, weightGrams, collectMinor: s.codAmountMinor, at });
  if (fits.includes(paid.key)) return 'same';
  const read = courierReadBand(paid.key, fits);
  if (!read) return 'unread';
  const other = await deps.db.deliveryBand.findFirst({ where: { storeId, key: read }, select: { chargeMinor: true } });
  if (!other) return 'unread';
  const freeDelivery = s.order.deliveryChargeMinor === 0;
  try {
    await deps.db.chargeMismatch.create({
      data: {
        storeId,
        orderId: s.orderId,
        shipmentId: s.id,
        courierAccountId: s.courierAccountId,
        chargedBandKey: paid.key,
        courierBandKey: read,
        chargedBandMinor: paid.chargeMinor,
        courierBandMinor: other.chargeMinor,
        differenceMinor: mismatchGap({ paidBandMinor: paid.chargeMinor, courierBandMinor: other.chargeMinor, freeDelivery }),
        freeDelivery,
        courierChargeMinor: chargeMinor,
        weightGrams,
        source,
        createdAt: nowOf(deps),
      },
    });
  } catch (e) {
    // another reader wrote the same parcel first: one row per parcel
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'already';
    throw e;
  }
  return 'recorded';
}

/** `noteCourierCharge` for several parcels of one statement; a failure on one never stops the rest or the caller. */
export async function noteStatementCharges(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number, lines: readonly { shipmentId: string; chargeMinor: number | null }[]): Promise<number> {
  let recorded = 0;
  for (const l of lines) {
    try {
      if ((await noteCourierCharge(deps, { storeId, shipmentId: l.shipmentId }, 'statement', { statementChargeMinor: l.chargeMinor })) === 'recorded') recorded++;
    } catch {
      // the log is a record only: a parcel it could not read is simply not written
    }
  }
  return recorded;
}

const reportQuery = z.object({ months: z.int().min(1).max(12).default(6), recent: z.int().min(0).max(100).default(20), lang: z.enum(['en', 'bn']).default('en') }).strict();

export interface MismatchMonth {
  /** `YYYY-MM` in the store's time zone. */
  month: string;
  cases: number;
  /** The customer paid less than the courier's band costs (the shop's charges): what it came to. */
  underMinor: number;
  /** The customer paid more than the courier's band costs. */
  overMinor: number;
}

export interface MismatchCase {
  id: string;
  orderId: string;
  orderNumber: string;
  courier: string;
  chargedBandKey: string;
  courierBandKey: string;
  /** The bands' names in the asked language (the key when a band is gone). */
  chargedBand: string;
  courierBand: string;
  gapMinor: number;
  freeDelivery: boolean;
  courierChargeMinor: number | null;
  source: string | null;
  at: Date;
}

export interface MismatchReport {
  enabled: boolean;
  /** Newest month first, every month of the period (an empty month shows 0). */
  months: MismatchMonth[];
  recent: MismatchCase[];
}

const monthOf = (d: Date, timeZone: string): string => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
};

/** The months of the period, newest first (`YYYY-MM`). */
export function monthsBack(now: Date, timeZone: string, months: number): string[] {
  const [y, m] = monthOf(now, timeZone).split('-').map(Number) as [number, number];
  return Array.from({ length: months }, (_, i) => {
    const k = y * 12 + (m - 1) - i;
    return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
  });
}

/** The monthly count and total, and the latest cases (`reports.read`, Reports › Delivery & RTO). Read-only. */
export async function chargeMismatchReport(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, who: Who, query: unknown = {}): Promise<MismatchReport> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'reports.read', { storeId: who.storeId });
  const q = parse(reportQuery, query, 'mismatch report');
  const storeId = who.storeId;
  const [cfg, timeZone] = await Promise.all([setting(deps, storeId, 'delivery.chargeMismatch'), setting(deps, storeId, 'store.timeZone')]);
  const now = nowOf(deps);
  const keys = monthsBack(now, timeZone, q.months);
  // a day either side of the first month covers any time zone; rows are bucketed by their local month below
  const since = new Date(now.getTime() - (q.months * 31 + 1) * 86_400_000);
  const rows = await deps.db.chargeMismatch.findMany({
    where: { storeId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderId: true, courierAccountId: true, chargedBandKey: true, courierBandKey: true, differenceMinor: true, freeDelivery: true, courierChargeMinor: true, source: true, createdAt: true },
  });
  const byMonth = new Map(keys.map((k) => [k, { month: k, cases: 0, underMinor: 0, overMinor: 0 }]));
  for (const r of rows) {
    const b = byMonth.get(monthOf(r.createdAt, timeZone));
    if (!b) continue;
    b.cases++;
    if (r.differenceMinor > 0) b.underMinor += r.differenceMinor;
    else b.overMinor -= r.differenceMinor;
  }
  const shown = rows.filter((r) => byMonth.has(monthOf(r.createdAt, timeZone))).slice(0, q.recent);
  const bandKeys = [...new Set(shown.flatMap((r) => [r.chargedBandKey, r.courierBandKey]).filter((x): x is string => !!x))];
  const [orders, couriers, bands] = await Promise.all([
    deps.db.order.findMany({ where: { storeId, id: { in: [...new Set(shown.map((r) => r.orderId))] } }, select: { id: true, number: true } }),
    deps.db.courierAccount.findMany({ where: { storeId, id: { in: [...new Set(shown.map((r) => r.courierAccountId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    deps.db.deliveryBand.findMany({ where: { storeId, key: { in: bandKeys } }, select: { key: true, nameEn: true, nameBn: true } }),
  ]);
  const bandName = new Map(bands.map((b) => [b.key, (q.lang === 'bn' ? b.nameBn : null) || b.nameEn]));
  const numberOf = new Map(orders.map((o) => [o.id, o.number]));
  const nameOf = new Map(couriers.map((c) => [c.id, c.name]));
  return {
    enabled: cfg.enabled,
    months: keys.map((k) => byMonth.get(k)!),
    recent: shown.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: numberOf.get(r.orderId) ?? '—',
      courier: (r.courierAccountId && nameOf.get(r.courierAccountId)) || '—',
      chargedBandKey: r.chargedBandKey,
      courierBandKey: r.courierBandKey ?? '—',
      chargedBand: bandName.get(r.chargedBandKey) ?? r.chargedBandKey,
      courierBand: (r.courierBandKey && bandName.get(r.courierBandKey)) || r.courierBandKey || '—',
      gapMinor: r.differenceMinor,
      freeDelivery: r.freeDelivery,
      courierChargeMinor: r.courierChargeMinor,
      source: r.source,
      at: r.createdAt,
    })),
  };
}
