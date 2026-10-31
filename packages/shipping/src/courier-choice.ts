// S08 · PR 178 — the courier picked by the real cost of the parcel (SIM-F-029: the parcel's weight changes the cost).
// For one order: its delivery band (the zone key of every rate card), the pieces' weight (unknown when any piece has
// none), the amount the rider collects; then, for each courier account that is on, its own rate card for that band and
// weight on the day (`rateFor`, the same rule as the RTO cost book), plus the COD fee on the amount collected when
// `delivery.courier.selection.codFee` is on. The cheapest known cost is the suggestion; a courier with no card for the
// band, or no card for an unknown weight, says why and is never guessed. Off by default (`delivery.courier.selection`).
//
// This is the shop's own cost only: the delivery charge the customer pays (PR 550) is never read or changed here, and
// booking stays a person's press (`bookOrders`; `bookCheapest` books each ticked order with its own suggestion).
import { z } from 'zod';
import { codToCollect } from '@extas/orders';
import { allow, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { bookOrders, type BookingOutcome } from './booking';
import { ShippingError } from './errors';
import { parcelWeight, rateFor, type RateCardRow } from './pure';

/** Why a courier has no cost for this parcel. */
export type NoCost = 'NO_BAND' | 'NO_RATE' | 'NO_WEIGHT';

export interface CourierCost {
  courierAccountId: string;
  name: string;
  /** What this courier would charge the shop for the parcel; null with the reason when not known. */
  costMinor: number | null;
  why: NoCost | null;
}

export interface CourierChoice {
  orderId: string;
  /** False while `delivery.courier.selection` is off: nothing is suggested. */
  enabled: boolean;
  zoneKey: string | null;
  weightGrams: number | null;
  /** Every courier that is on, the cheapest known first, then the ones with no cost (by name). */
  costs: CourierCost[];
  /** The cheapest courier with a known cost; null when none is known. */
  cheapest: string | null;
}

/** A rate card's cost for one parcel: the charge, plus the COD fee on the amount collected (rounded) when counted. */
export function courierCostMinor(card: Pick<RateCardRow, 'chargeMinor'> & { codFeeBps: number | null }, collectMinor: number, withCodFee: boolean): number {
  const fee = withCodFee && card.codFeeBps && collectMinor > 0 ? Math.round((collectMinor * card.codFeeBps) / 10_000) : 0;
  return card.chargeMinor + fee;
}

/** Cheapest known first (ties: by name, then id), then the unknown ones by name. */
export function rankCosts(costs: readonly CourierCost[]): CourierCost[] {
  return [...costs].sort((a, b) => {
    if (a.costMinor === null || b.costMinor === null) return a.costMinor === null && b.costMinor === null ? a.name.localeCompare(b.name) : a.costMinor === null ? 1 : -1;
    return a.costMinor - b.costMinor || a.name.localeCompare(b.name) || a.courierAccountId.localeCompare(b.courierAccountId);
  });
}

const ORDER_SELECT = {
  id: true,
  paymentMethod: true,
  totalMinor: true,
  walletAppliedMinor: true,
  paidMinor: true,
  deliveryBand: { select: { key: true } },
  items: { where: { status: 'ACTIVE' }, select: { quantity: true, variantId: true } },
} as const;

/** The courier costs of a few orders at once (the packing screen, the booking list). */
export async function courierChoices(deps: ShippingDeps, who: Who, orderIds: readonly string[]): Promise<CourierChoice[]> {
  await allow(deps, who, 'delivery.book');
  const ids = parse(z.array(z.uuid()).max(200), [...new Set(orderIds)], 'orders');
  const cfg = await setting(deps, who.storeId, 'delivery.courier.selection');
  const [orders, accounts] = await Promise.all([
    deps.db.order.findMany({ where: { id: { in: ids }, storeId: who.storeId }, select: ORDER_SELECT }),
    deps.db.courierAccount.findMany({ where: { storeId: who.storeId, enabled: true, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!cfg.enabled) return orders.map((o) => ({ orderId: o.id, enabled: false, zoneKey: o.deliveryBand?.key ?? null, weightGrams: null, costs: [], cheapest: null }));
  const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId)).filter((v): v is string => !!v))];
  const now = nowOf(deps);
  const [variants, cards] = await Promise.all([
    deps.db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, weightGrams: true } }),
    deps.db.courierRateCard.findMany({
      where: { storeId: who.storeId, courierAccountId: { in: accounts.map((a) => a.id) }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { courierAccountId: true, zoneKey: true, weightFromGrams: true, weightToGrams: true, chargeMinor: true, codFeeBps: true, returnChargeMinor: true, validFrom: true, validTo: true },
    }),
  ]);
  const weightOf = new Map(variants.map((v) => [v.id, v.weightGrams]));
  const cardsOf = new Map<string, typeof cards>();
  for (const c of cards) cardsOf.set(c.courierAccountId, [...(cardsOf.get(c.courierAccountId) ?? []), c]);
  return orders.map((o) => {
    const zoneKey = o.deliveryBand?.key ?? null;
    const weightGrams = parcelWeight(o.items.map((i) => ({ productName: '', colourName: null, sizeLabel: null, quantity: i.quantity, weightGrams: i.variantId ? (weightOf.get(i.variantId) ?? null) : null })));
    const collect = codToCollect(o);
    const costs = rankCosts(
      accounts.map((a) => {
        const mine = cardsOf.get(a.id) ?? [];
        if (!zoneKey) return { courierAccountId: a.id, name: a.name, costMinor: null, why: 'NO_BAND' as const };
        const card = rateFor(mine, { zoneKey, weightGrams, at: now }) as (RateCardRow & { codFeeBps: number | null }) | null;
        if (!card) return { courierAccountId: a.id, name: a.name, costMinor: null, why: weightGrams === null && mine.some((c) => c.zoneKey === zoneKey) ? ('NO_WEIGHT' as const) : ('NO_RATE' as const) };
        return { courierAccountId: a.id, name: a.name, costMinor: courierCostMinor(card, collect, cfg.codFee), why: null };
      }),
    );
    return { orderId: o.id, enabled: true, zoneKey, weightGrams, costs, cheapest: costs[0]?.costMinor != null ? costs[0].courierAccountId : null };
  });
}

export interface CheapestRun {
  /** One run per courier the ticked orders went to. */
  runs: { courierAccountId: string; results: BookingOutcome[] }[];
  /** Orders with no known cost at any courier: left for a person to book with a courier he picks. */
  noCost: string[];
}

/** "Book with the cheapest": each ticked order with its own cheapest courier (a person's press; only while on). */
export async function bookCheapest(deps: ShippingDeps, who: Who, input: unknown): Promise<CheapestRun> {
  await allow(deps, who, 'delivery.book');
  const v = parse(z.object({ orderIds: z.array(z.uuid()).min(1).max(200) }).strict(), input, 'booking');
  if (!(await setting(deps, who.storeId, 'delivery.courier.selection')).enabled) throw new ShippingError('SELECTION_OFF', 'the courier choice by cost is switched off');
  const choices = await courierChoices(deps, who, v.orderIds);
  const groups = new Map<string, string[]>();
  const noCost: string[] = [];
  for (const id of new Set(v.orderIds)) {
    const c = choices.find((x) => x.orderId === id);
    if (!c?.cheapest) noCost.push(id);
    else groups.set(c.cheapest, [...(groups.get(c.cheapest) ?? []), id]);
  }
  const runs: CheapestRun['runs'] = [];
  for (const [courierAccountId, orderIds] of groups) runs.push({ courierAccountId, results: (await bookOrders(deps, who, { courierAccountId, orderIds })).results });
  return { runs, noCost };
}
