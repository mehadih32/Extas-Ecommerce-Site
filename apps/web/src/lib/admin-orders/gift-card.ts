// PR 605 follow-up 214 — the gift on one order's screen (OrderDetail.delivery, packages/orders delivery-target.ts): the
// order's name, phone and address are the receiver's (the customer card shows them), and this card says it is a gift,
// who it is from, the sender's contact (for the order's updates only: never printed, never given to the courier), the
// gift note, the day the courier delivers on or after, and whether the receiver's invoice hides prices. Read only.
import type { DeliveryTarget } from '@extas/orders/pure';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

export interface GiftRow {
  label: string;
  value: string;
  strong?: boolean;
}

/** The gift card's rows (null: not a gift). */
export function giftRows(view: AdminView, gift: DeliveryTarget['gift']): GiftRow[] | null {
  if (!gift) return null;
  const d = view.dict;
  const none = t(d, 'orders.list.none');
  const day = gift.deliverAfter ? new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${gift.deliverAfter}T00:00:00Z`)) : null;
  return [
    { label: t(d, 'orders.gift.from'), value: gift.senderName?.trim() || none, strong: true },
    { label: t(d, 'orders.gift.contact'), value: gift.senderContact?.trim() || none },
    { label: t(d, 'orders.gift.note'), value: gift.note?.trim() || none },
    { label: t(d, 'orders.gift.after'), value: day ? t(d, 'orders.gift.afterDay', { day }) : t(d, 'orders.gift.asap') },
    { label: t(d, 'orders.gift.invoice'), value: t(d, gift.hidePrices ? 'orders.gift.hidden' : 'orders.gift.shown') },
  ];
}
