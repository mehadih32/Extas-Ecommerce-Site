// PR 126 — the thank-you page, at /checkout/thanks/<number> and /bn/checkout/thanks/<number>. Only the browser that
// placed the order sees it (the bag cookie's visitor id); anyone else, or an unknown number, gets "Order not found".
// Never a search result.
import type { Metadata } from 'next';
import { ThanksNotFound, ThanksPage } from '@/components/shop/checkout/ThanksPage';
import { checkoutSettings, currentReceipt } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'checkout', c.t('checkout.ty.pageTitle'))), robots: { index: false, follow: false } };
}

export default async function Thanks({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const c = await shopContext();
  const [r, s] = await Promise.all([currentReceipt(c, decodeURIComponent(number)), checkoutSettings(c.storeId)]);
  return r ? <ThanksPage c={c} r={r} waOn={s['checkout.help.enabled']} /> : <ThanksNotFound c={c} />;
}
