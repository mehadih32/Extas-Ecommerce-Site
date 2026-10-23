// PR 605 (SIM-F-007) — who and where a parcel goes to, written once for every reader of an order: the sticker (PR 179),
// the courier booking (PR 176), the rider's call and the order page. A gift's name, phone and address are the
// RECEIVER's (that is what the checkout stored on the order), so the parcel goes to him; the sender's name, his contact
// for updates, the gift note and "deliver on or after" go with it. Nothing here reads the sender's contact as the
// parcel's phone: the courier never calls the sender, and the receiver never sees the sender's number. Pure.

/** The order fields the delivery target is made from. */
export interface DeliveryTargetRow {
  customerName: string | null;
  phone: string | null;
  shippingAddressText: string | null;
  /** PR 561: the full address the shop holds for that phone, when the backfill filled it in. */
  backfilledAddress: string | null;
  isGift: boolean;
  giftSenderName: string | null;
  giftSenderContact: string | null;
  giftNote: string | null;
  giftDeliverAfter: Date | null;
  giftHidePrices: boolean;
}

export interface DeliveryTarget {
  /** The person the parcel goes to (a gift: the receiver). */
  name: string | null;
  /** The phone the courier calls (a gift: the receiver's, never the sender's). */
  phone: string | null;
  /** The address to print and book: the full one the shop holds when the backfill found it, else as typed. */
  address: string | null;
  /** The address as the customer typed it. */
  addressTyped: string | null;
  gift: {
    /** "From" on the sticker and the gift card. */
    senderName: string | null;
    /** Only for the order's updates (a phone of any country or an e-mail); never printed, never given to the courier. */
    senderContact: string | null;
    note: string | null;
    /** The courier delivers on this day or after it (YYYY-MM-DD); null: as soon as it can. */
    deliverAfter: string | null;
    /** The receiver's invoice shows no prices. */
    hidePrices: boolean;
  } | null;
}

/** The parcel's addressee and, for a gift, what goes with it. */
export function deliveryTarget(o: DeliveryTargetRow): DeliveryTarget {
  const typed = o.shippingAddressText?.trim() || null;
  return {
    name: o.customerName?.trim() || null,
    phone: o.phone,
    address: o.backfilledAddress?.trim() || typed,
    addressTyped: typed,
    gift: o.isGift
      ? {
          senderName: o.giftSenderName,
          senderContact: o.giftSenderContact,
          note: o.giftNote,
          deliverAfter: o.giftDeliverAfter ? o.giftDeliverAfter.toISOString().slice(0, 10) : null,
          hidePrices: o.giftHidePrices,
        }
      : null,
  };
}

/** The order fields to select for `deliveryTarget` (Prisma select). */
export const DELIVERY_TARGET_SELECT = {
  customerName: true,
  phone: true,
  shippingAddressText: true,
  backfilledAddress: true,
  isGift: true,
  giftSenderName: true,
  giftSenderContact: true,
  giftNote: true,
  giftDeliverAfter: true,
  giftHidePrices: true,
} as const;
