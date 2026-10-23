// PR 134 — one order's page, at /account/orders/<number> and /bn/account/orders/<number> (noindex): for the signed-in
// customer whose order it is (any device) or the browser that placed it; anyone else is asked to log in.
import type { Metadata } from 'next';
import { OrderPage, OrderPrompt } from '@/components/shop/account/OrderPage';
import { accountReceipt, checkoutSettings } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'account', c.t('account.order.pageTitle', { number: decodeURIComponent(number) }))), robots: { index: false, follow: false } };
}

export default async function Order({ params }: { params: Promise<{ number: string }> }) {
  const number = decodeURIComponent((await params).number).slice(0, 40);
  const c = await shopContext();
  const [{ receipt, signedIn }, s] = await Promise.all([accountReceipt(c, number), checkoutSettings(c.storeId)]);
  if (!receipt) return <OrderPrompt c={c} number={number} signedIn={signedIn} />;
  return <OrderPage c={c} r={receipt} waOn={s['checkout.help.enabled']} />;
}
