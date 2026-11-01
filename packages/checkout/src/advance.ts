// S04 · PR 560 — the advance-payment checkout mode (CN-012 (2), CN-018 (2); SIM-F-016): for a flagged customer only,
// and only once he has filled everything in (his name, a real mobile number and an address the gazetteer settled),
// Cash on Delivery disappears and bKash, Nagad and card stay open, with one neutral line — the delivery charge ahead,
// a part ahead, or the full amount ahead, by the layer that flagged him (the owner's Parameter for Checkout, PR 558).
// It is the same checkout page with the payment section swapped, never a second page. The customer never sees a score
// or a reason. The look itself is the app's (`CheckoutDeps.advanceFlag`, @extas/orders `checkoutFlag`): without it, or
// while the owner keeps `checkout.advance` off, nobody is flagged.
//
// The money stays exactly what it was: a part or the delivery charge ahead is a Cash on Delivery order with that much
// paid now (priced as Cash on Delivery, no prepaid reward); the full amount ahead is an ordinary prepaid order. Nothing
// here blocks anyone or changes a price, a charge or a discount.
import { phoneNormalizeBD } from '@extas/delivery/phone';

/** What a layer asks ahead (PR 558's requirements, less "nothing"). */
export type AdvanceRequirement = 'DELIVERY_CHARGE' | 'PART_AMOUNT' | 'FULL_AMOUNT';
/** The same, as the page says it. */
export type AdvanceKind = 'delivery' | 'part' | 'full';

export const KIND_OF: Record<AdvanceRequirement, AdvanceKind> = { DELIVERY_CHARGE: 'delivery', PART_AMOUNT: 'part', FULL_AMOUNT: 'full' };

/** The payment's purpose for each kind (the payment page pays it; the order service sees the advance met). */
export const ADVANCE_PURPOSE = { delivery: 'ADVANCE_DELIVERY_CHARGE', part: 'PART_ADVANCE', full: 'FULL_ADVANCE' } as const satisfies Record<AdvanceKind, string>;
/**
 * The flag event's outcome as the checkout records it: ASKED, the order placed with the ask (PR 560); SHOWN, a bag a layer
 * asked to pay ahead, once (PR 562, while the flag outcome report is on). The report works out what happened next.
 */
export const FLAG_OUTCOMES = { asked: 'ASKED', shown: 'SHOWN' } as const;

/** Every purpose the checkout's own payment page pays. */
export const CHECKOUT_PAY_PURPOSES = ['ORDER', ...Object.values(ADVANCE_PURPOSE)] as ('ORDER' | (typeof ADVANCE_PURPOSE)[AdvanceKind])[];

/** The checkout as the look reads it (no order exists yet). */
export interface AdvanceFlagInput {
  storeId: number;
  /** The phone as the checkout normalised it (E.164). */
  phone: string;
  areaId: string | null;
  resolved: boolean;
  placeSure: boolean | null;
  totalMinor: number;
  pieces: number;
  /** PR 559 (SIM-F-015): this browser's device id, the name and the address line, so the look sees more than the number. */
  deviceId?: string | null;
  name?: string | null;
  addressText?: string | null;
}

/** The layer that flags a checkout (for the shop's own records only, never for the customer). */
export interface AdvanceFlag {
  layerId: string;
  layerName: string;
  requirement: AdvanceRequirement;
  partPercent: number | null;
  score: number;
  band: string;
}

/** The payment section's one neutral line: what is paid now and what is left for the door. */
export interface AdvanceView {
  kind: AdvanceKind;
  amountMinor: number;
  /** What is paid on delivery (0 for the full amount). */
  restMinor: number;
}

/** The customer's details as the page has them so far (the name and phone he typed). */
export interface CheckoutDetails {
  name: string;
  phone: string;
}

/** He has filled everything in: a name as long as the form asks, a real mobile number, and a settled address. */
export function detailsFinished(d: CheckoutDetails | null | undefined, nameMin: number, addressSettled: boolean): { phone: string; name: string } | null {
  if (!d || !addressSettled) return null;
  if ([...d.name.trim()].length < Math.max(1, nameMin)) return null;
  const p = phoneNormalizeBD(d.phone);
  return p.ok ? { phone: p.e164, name: d.name.trim() } : null;
}

/**
 * What a layer asks ahead, in minor units (0: nothing to ask — a delivery charge that is free or not known). Never more
 * than is due; a part is rounded up to the minor unit.
 */
export function advanceAmountOf(requirement: AdvanceRequirement, partPercent: number | null, m: { dueMinor: number; chargeMinor: number | null }): number {
  const due = Math.max(0, m.dueMinor);
  if (requirement === 'FULL_AMOUNT') return due;
  if (requirement === 'DELIVERY_CHARGE') return Math.min(due, Math.max(0, m.chargeMinor ?? 0));
  return partPercent ? Math.min(due, Math.ceil((due * partPercent) / 100)) : 0;
}
