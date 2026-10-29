// PR 179 (Blueprint B1.4; SIM-F-004, SIM-F-007) — the rules of the courier sticker without a database.
//
// - `STILL_WITH_US`: a booked parcel the courier has not picked up yet (Steadfast "In Review", "Pending pickup").
// - `stickerProblem`: a sticker is printed only for a booked parcel still with us, and only while the amount the courier
//   will collect is the order's live amount due and the receiver is the one the courier has (SIM-F-004: edits close at
//   booking, so a difference means something changed that needs a re-booking, never a sticker that disagrees with the
//   courier).
// - `printOrder`: the stickers come out in packing order — the category with the most pieces first, then the style with
//   the most pieces; an order with several categories goes with its biggest category.
// - PR 180 (B1.5) `handoverProblem`: a parcel goes on the rider's handover sheet only when its sticker can be printed,
//   was printed at least once, and its order is waiting to be handed over (confirmed, picking or packed).
// - PR 182 (follow-up 433): while the owner's "mark packed on handover" is off (the default once the packing screen is
//   in), only a packed order is ready: an order nobody packed is NOT_PACKED.
import { dueOf, type DeliveryTarget } from '@extas/orders/pure';
import { courierPhone } from './pure';

/** A booked parcel the courier has not picked up yet. */
export const STILL_WITH_US = ['IN_REVIEW', 'PENDING_PICKUP'] as const;

/** Why a parcel's sticker is not printed. */
export const STICKER_PROBLEMS = ['NOT_BOOKED', 'NOT_WITH_US', 'COD_CHANGED', 'RECEIVER_CHANGED'] as const;
export type StickerProblem = (typeof STICKER_PROBLEMS)[number];

/** What the courier has for the parcel (Shipment.receiver as booked). */
export interface BookedReceiver {
  name: string | null;
  phone: string | null;
  address: string | null;
  gift?: { senderName: string | null; deliverAfter: string | null; note: string | null } | null;
}

/** Reads Shipment.receiver (JSON) safely. */
export function bookedReceiver(json: unknown): BookedReceiver {
  const r = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  const g = r.gift && typeof r.gift === 'object' ? (r.gift as Record<string, unknown>) : null;
  return { name: s(r.name), phone: s(r.phone), address: s(r.address), gift: g ? { senderName: s(g.senderName), deliverAfter: s(g.deliverAfter), note: s(g.note) } : null };
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').replace(/\s+/g, ' ').trim() === (b ?? '').replace(/\s+/g, ' ').trim();

export interface StickerFacts {
  status: string;
  consignmentId: string | null;
  codAmountMinor: number;
  receiver: BookedReceiver;
  order: { totalMinor: number; walletAppliedMinor: number; paidMinor: number };
  target: Pick<DeliveryTarget, 'name' | 'phone' | 'address'>;
  /** PR 180: the order was handed over to the courier already (it is no longer with us). */
  handedOver?: boolean;
}

/** Why this parcel's sticker cannot be printed now, or null. */
export function stickerProblem(f: StickerFacts): StickerProblem | null {
  if (!f.consignmentId) return 'NOT_BOOKED';
  if (!(STILL_WITH_US as readonly string[]).includes(f.status) || f.handedOver) return 'NOT_WITH_US';
  if (dueOf(f.order) !== f.codAmountMinor) return 'COD_CHANGED';
  if (!same(f.receiver.name, f.target.name) || !same(f.receiver.phone, courierPhone(f.target.phone)) || !same(f.receiver.address, f.target.address)) return 'RECEIVER_CHANGED';
  return null;
}

/** One parcel for the print order: its pieces with their category and style (product). */
export interface PrintOrderParcel {
  key: string;
  orderNumber: string;
  pieces: readonly { category: string; style: string; quantity: number }[];
}

/**
 * The parcels in packing order (B1.4): the category with the most pieces in this print first, then within it the style
 * with the most pieces; a parcel with several categories goes with the one that has the most pieces; ties by name,
 * then by order number. Returns the keys in order.
 */
export function printOrder(parcels: readonly PrintOrderParcel[]): string[] {
  const cat = new Map<string, number>();
  const style = new Map<string, number>();
  for (const p of parcels)
    for (const it of p.pieces) {
      cat.set(it.category, (cat.get(it.category) ?? 0) + it.quantity);
      style.set(it.style, (style.get(it.style) ?? 0) + it.quantity);
    }
  const byCount = (m: Map<string, number>) => (a: string, b: string) => (m.get(b) ?? 0) - (m.get(a) ?? 0) || a.localeCompare(b);
  const placed = parcels.map((p) => {
    const cats = [...new Set(p.pieces.map((i) => i.category))].sort(byCount(cat));
    const group = cats[0] ?? '';
    const styles = [...new Set(p.pieces.filter((i) => i.category === group).map((i) => i.style))].sort(byCount(style));
    return { p, group, style: styles[0] ?? '' };
  });
  placed.sort((a, b) => byCount(cat)(a.group, b.group) || byCount(style)(a.style, b.style) || a.p.orderNumber.localeCompare(b.p.orderNumber, 'en', { numeric: true }));
  return placed.map((x) => x.p.key);
}

/** PR 180 — the order states a parcel is handed over from (confirmed, picking started, packed). */
export const HANDOVER_FROM = ['CONFIRMED', 'PROCESSING', 'PACKED'] as const;

/** Why a parcel is not on the handover sheet: a sticker problem, the sticker never printed, the order not waiting, or
 * (PR 182) not packed while packing comes first. */
export const HANDOVER_PROBLEMS = [...STICKER_PROBLEMS, 'NOT_PRINTED', 'NOT_READY', 'NOT_PACKED'] as const;
export type HandoverProblem = (typeof HANDOVER_PROBLEMS)[number];

/** Why this parcel cannot be handed over now, or null. */
export function handoverProblem(f: StickerFacts & { printCount: number; orderStatus: string; packedFirst?: boolean }): HandoverProblem | null {
  const sticker = stickerProblem(f);
  if (sticker) return sticker;
  if (!(HANDOVER_FROM as readonly string[]).includes(f.orderStatus)) return 'NOT_READY';
  if (f.printCount < 1) return 'NOT_PRINTED';
  if (f.packedFirst && f.orderStatus !== 'PACKED') return 'NOT_PACKED';
  return null;
}
