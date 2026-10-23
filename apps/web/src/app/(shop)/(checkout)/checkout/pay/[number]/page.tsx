// PR 125 — a prepaid order's payment, at /checkout/pay/<number> and /bn/checkout/pay/<number>. Until the gateways of S07
// (PR 167–169) are connected it is the mock (A1.3): the page says plainly that no money is taken, and its two buttons
// stand for the gateway's two answers — paid, or failed (kept, and "Try again" makes a new payment for the same order).
// Only the browser that placed the order can open it; anyone else gets "page not found". Never a search result.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PayPage } from '@/components/shop/checkout/PayPage';
import { checkoutWords, currentPayment } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'checkout', c.t('checkout.mock.title'))), robots: { index: false, follow: false } };
}

export default async function Pay({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = decodeURIComponent(raw);
  const c = await shopContext();
  const p = await currentPayment(c, number);
  if (!p) notFound();
  const thanks = hrefIn(c.lang, ROUTES.thanks(p.number));
  if (p.status === 'PAID') redirect(thanks);
  const words = checkoutWords(c);
  const method = p.provider === 'online' || p.method === 'ONLINE' ? words['pay.online'] : (words[`pm.${p.provider ?? ''}`] ?? p.provider ?? '');
  return <PayPage number={p.number} amount={c.money(p.amountMinor)} method={method ?? ''} failed={p.status === 'FAILED'} open={p.status === 'INITIATED' || p.status === 'PENDING'} lang={c.lang} words={words} thanks={thanks} />;
}
