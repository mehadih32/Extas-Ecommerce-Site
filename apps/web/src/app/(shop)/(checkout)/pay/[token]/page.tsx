// S06 · PR 542 — the advance pay link, at /pay/<token> and /bn/pay/<token> (sent by SMS or WhatsApp when a person
// presses "Request advance" on the order). No login: the token alone finds the payment, and the page shows only the
// order number and the amount. Paying it (the gateway's page, or the test page while the owner's test payments are on)
// moves the order on; a failure is kept and "Try again" makes a new try of the same link. Never a search result.
import type { Metadata } from 'next';
import { LinkPayNotFound, LinkPayPage } from '@/components/shop/checkout/LinkPayPage';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { currentPayLink, payLinkWords } from '@/lib/shop/pay-link';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'checkout', c.t('paylink.pageTitle'))), robots: { index: false, follow: false } };
}

export default async function PayLink({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const c = await shopContext();
  const words = payLinkWords(c);
  const home = hrefIn(c.lang, ROUTES.home);
  const v = await currentPayLink(token);
  if (!v) return <LinkPayNotFound words={words} home={home} />;
  const pm = `checkout.pm.${v.provider ?? ''}`;
  const method = v.provider === 'online' || v.method === 'ONLINE' ? (words.online ?? '') : c.t.has(pm) ? c.t(pm) : (v.provider ?? '');
  const state = v.status === 'PAID' ? 'paid' : v.closed ? 'closed' : v.canRetry ? 'failed' : v.open ? 'open' : 'closed';
  return <LinkPayPage token={v.token} number={v.number} amount={c.money(v.amountMinor)} method={method} state={state} test={v.test} gateway={v.gateway} lang={c.lang} words={words} home={home} />;
}
