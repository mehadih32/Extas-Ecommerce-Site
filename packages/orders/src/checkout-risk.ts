// S04 · PR 560 — the checkout's own risk look, before an order exists: once the customer has filled everything in, his
// number's history, his place and the bag are scored with the owner's own model (the same `riskConfig` and `scoreRisk`
// the order is scored with when it lands, PR 156) and tried against the Parameter for Checkout's layers (PR 558). The
// checkout gets back only what the matching layer asks for — never the score, the band or a reason, which the customer
// is never shown. ~~The identity and device signals need the placed order and are read only once it lands.~~ Off (null)
// while the owner keeps `checkout.advance` off, with no layer switched on, or when no layer flags this checkout.
// Nothing here blocks anyone or changes a price or a charge.
// PR 559 (SIM-F-015): the look no longer sees only the phone number — with the device id, the name and the address the
// checkout has, the same device and the same person under another number are read (while their signal or the pattern is
// on), and the couriers' own checks kept at phone entry (phone-risk.ts) feed the owner's `pattern`. A check that never
// came back is simply missing: the customer passes.
import { liveLayers, layerFor, type LayerRequirement } from './checkout-layers';
import { awaitAdvance } from './commands';
import { nowOf, setting, type OrdersDeps } from './context';
import { placeFactsOf, type AddressOrder } from './address-facts';
import { deviceOrders, identityOrders, type IdentityOrder } from './identity';
import { courierFactsOf } from './phone-risk';
import { phoneOrders } from './phone-history';
import { riskConfig } from './risk';
import { scoreRisk, type RiskFacts } from './risk-score';
import { systemBy } from './service';

/** The checkout as the look reads it (the phone as the checkout normalised it, the place its address read settled). */
export interface CheckoutRiskInput {
  storeId: number;
  phone: string;
  /** The place the address read settled (null: none). */
  areaId: string | null;
  /** The address read settled a place. */
  resolved: boolean;
  placeSure: boolean | null;
  /** What the order would cost in all, and its pieces. */
  totalMinor: number;
  pieces: number;
  /** PR 559 (SIM-F-015): this browser's device id (while the owner keeps device ids), the name and the address line typed. */
  deviceId?: string | null;
  name?: string | null;
  addressText?: string | null;
}

/** The layer that flags this checkout, as the checkout needs it (for its own records, never for the customer). */
export interface CheckoutFlag {
  layerId: string;
  layerName: string;
  requirement: Exclude<LayerRequirement, 'NONE'>;
  partPercent: number | null;
  /** For the team's records (the flag event's explanation), never shown to the customer. */
  score: number;
  band: string;
}

/** No order has this id: the pre-placement look excludes nothing. */
const NO_ORDER = '00000000-0000-0000-0000-000000000000';

/** PR 560 — the layer that flags this checkout, or null (off, no layer, nothing flagged, or a layer asking nothing). */
export async function checkoutFlag(deps: OrdersDeps, input: CheckoutRiskInput): Promise<CheckoutFlag | null> {
  const { storeId } = input;
  const cfg = await setting(deps, storeId, 'checkout.advance');
  if (!cfg.enabled) return null;
  const layers = (await liveLayers(deps, storeId)).filter((l) => l.enabled);
  if (!layers.length) return null;
  const now = nowOf(deps);
  const { config, historyOrders } = await riskConfig(deps, storeId);
  const s = config.signals;
  const pattern = s.pattern.enabled;
  const me: IdentityOrder = { id: NO_ORDER, phone: input.phone, customerName: input.name ?? null, shippingAddressText: input.addressText ?? null, placedAt: now, deviceId: input.deviceId ?? null };
  const [past, identity, device, courier] = await Promise.all([
    phoneOrders(deps, storeId, input.phone, { before: now, take: historyOrders }),
    // PR 559 (SIM-F-015): the same person under another number, and the same device, while their signal or the pattern is on
    (s.identityMatch.enabled || pattern) && me.customerName && me.shippingAddressText ? identityOrders(deps, storeId, me, s.identityMatch, historyOrders) : Promise.resolve([]),
    (s.deviceMatch.enabled || pattern) && me.deviceId ? deviceOrders(deps, storeId, me, s.deviceMatch, historyOrders) : Promise.resolve([]),
    pattern ? courierFactsOf(deps, storeId, input.phone, now) : Promise.resolve([]),
  ]);
  const o: AddressOrder = {
    id: NO_ORDER,
    phone: input.phone,
    placedAt: now,
    fulfillmentType: 'DELIVERY',
    areaId: input.areaId,
    addressResolution: { status: input.resolved ? 'resolved' : 'none', placeSure: input.placeSure },
    addressUnclear: !input.resolved,
    flags: [],
  };
  const place = await placeFactsOf(deps, storeId, o, past, { refusals: config.signals.areaRefusals.enabled });
  const facts: RiskFacts = { placedAt: now, totalMinor: input.totalMinor, past, ...place, pieces: input.pieces, identity, device, ...(courier.length ? { courier } : {}) };
  const r = scoreRisk(facts, config);
  const layer = layerFor(layers, { score: r.score, band: r.band.key, fired: r.fired.map((f) => f.key) });
  if (!layer || layer.requirement === 'NONE') return null;
  return { layerId: layer.id, layerName: layer.name, requirement: layer.requirement, partPercent: layer.partPercent, score: r.score, band: r.band.key };
}

/**
 * PR 560 — once a flagged checkout has landed, the order waits for the advance its layer asked (the order service's own
 * AWAITING_ADVANCE, PR 542: never cancelled by itself, never blocked; the payment page pays it and `recordAdvance` puts
 * it back in the queue). The amount is the one the checkout stored on the order. True when it now waits; false for any
 * other order (not flagged, a gift, already waiting or paid, or no longer just placed).
 */
export async function askCheckoutAdvance(deps: OrdersDeps, r: { storeId: number; orderId: string }): Promise<boolean> {
  const o = await deps.db.order.findFirst({ where: { id: r.orderId, storeId: r.storeId }, select: { status: true, isGift: true, advanceRequirement: true, advanceRequiredMinor: true, paidMinor: true } });
  if (!o || o.status !== 'PLACED' || o.isGift || o.advanceRequirement === 'NONE') return false;
  const required = o.advanceRequiredMinor ?? 0;
  if (required <= 0 || o.paidMinor >= required) return false;
  await awaitAdvance(deps, r, systemBy('checkout'), { requiredMinor: required, level: 'checkout' });
  return true;
}
