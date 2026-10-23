// PR 115 — the checkout, at /checkout and /bn/checkout (demo 51-checkout.js): the visitor's bag, priced by the engines,
// inside the slim checkout shell; with an empty bag the empty-bag card. Never a search result, in either language.
// PR 137: a signed-in customer's checkout starts with his own details.
// PR 605: `?gift=1` ("Send as a gift" in the bag) opens it as a gift, while the owner has gift mode on.
import type { Metadata } from 'next';
import { CheckoutPage } from '@/components/shop/checkout/CheckoutPage';
import { checkoutSettings, currentCheckout, currentPrefill } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { tryGiftOn } from '@/lib/shop/try-gift';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'checkout', c.t('checkout.title'))), robots: { index: false, follow: false } };
}

export default async function Checkout({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [c, sp] = await Promise.all([shopContext(), searchParams]);
  const asGift = sp.gift === '1';
  const [quote, s, prefill, trial] = await Promise.all([currentCheckout(c, { gift: asGift }), checkoutSettings(c.storeId), currentPrefill(c), tryGiftOn()]);
  return <CheckoutPage c={c} quote={quote} s={s} prefill={prefill} gift={asGift && (s['checkout.gift'].enabled || trial)} />;
}
