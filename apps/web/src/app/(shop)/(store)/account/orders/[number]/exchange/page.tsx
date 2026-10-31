// S08 · PR 186 — an exchange asked for from the account, at /account/orders/<number>/exchange and
// /bn/account/orders/<number>/exchange (noindex): for the signed-in customer whose order it is; signed out or not his
// order, a log-in prompt that comes back here (`?line=` keeps the piece he tapped on the order page). Switched off by the
// owner (`orders.exchange.account`, off by default): no such page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExchangePage, ExchangePrompt } from '@/components/shop/account/ExchangePage';
import { exchangeLoad } from '@/lib/shop/account-exchange';
import { accountReceipt, checkoutSettings } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

const numberOf = async (params: Promise<{ number: string }>) => decodeURIComponent((await params).number).slice(0, 40);

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'account', c.t('account.exchange.pageTitle', { number: await numberOf(params) }))), robots: { index: false, follow: false } };
}

export default async function Exchange({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const number = await numberOf(params);
  const lineParam = (await searchParams).line;
  const line = typeof lineParam === 'string' && /^[0-9a-f-]{36}$/i.test(lineParam) ? lineParam : null;
  const c = await shopContext();
  const load = await exchangeLoad(c, number);
  if (load.kind === 'off') notFound();
  if (load.kind !== 'state') return <ExchangePrompt c={c} number={number} signedIn={load.kind === 'notHis'} line={line} />;
  const [{ receipt }, s] = await Promise.all([accountReceipt(c, load.state.number), checkoutSettings(c.storeId)]);
  return <ExchangePage c={c} state={load.state} receipt={receipt} waOn={s['checkout.help.enabled']} initialLine={line} />;
}
