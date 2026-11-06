// PR 605 follow-up (210, CN-020 (2)) — "Send as a gift" is a small link on the product page and in the bag. Both open
// the checkout as a gift (`?gift=1`), and only while the owner has gift mode on (`checkout.gift`, off as shipped) or a
// test server's gift trial is on for this browser (lib/shop/try-gift).
export const GIFT_QUERY = 'gift';

/** The checkout opened as a gift, or null while gift mode is off. */
export function giftCheckoutHref(checkoutHref: string, on: boolean): string | null {
  if (!on) return null;
  return `${checkoutHref}${checkoutHref.includes('?') ? '&' : '?'}${GIFT_QUERY}=1`;
}
