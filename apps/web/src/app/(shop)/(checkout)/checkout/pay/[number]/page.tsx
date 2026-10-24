// PR 125 — a prepaid order's payment, at /checkout/pay/<number> and /bn/checkout/pay/<number>. With a real gateway
// connected (S07, PR 167–170) "Pay" opens the gateway's page and the gateway's answer brings him back. Until then it is
// the test page (A1.3): it says plainly that no money is taken, and its two buttons stand for the gateway's two answers
// — paid, or failed (kept, and "Try again" makes a new payment for the same order). The test page answers only while the
// owner's test payments are on and no real gateway is connected (follow-up 50, the go-live guard); otherwise the page
// says online payment is not open now. Only the browser that placed the order can open it. Never a search result.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PayPage } from '@/components/shop/checkout/PayPage';
import { ThanksNotFound } from '@/components/shop/checkout/ThanksPage';
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
  if (!p) return <ThanksNotFound c={c} />;
  const thanks = hrefIn(c.lang, ROUTES.thanks(p.number));
  if (p.status === 'PAID') redirect(thanks);
  const words = checkoutWords(c);
  const method = p.provider === 'online' || p.method === 'ONLINE' ? words['pay.online'] : (words[`pm.${p.provider ?? ''}`] ?? p.provider ?? '');
  return <PayPage number={p.number} amount={c.money(p.amountMinor)} method={method ?? ''} failed={p.status === 'FAILED'} open={p.status === 'INITIATED' || p.status === 'PENDING'} test={p.test} gateway={p.gateway} lang={c.lang} words={words} thanks={thanks} />;
}
