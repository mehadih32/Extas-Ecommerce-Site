// PR 136 — an order's invoice, at /account/orders/<number>/invoice and /bn/account/orders/<number>/invoice (noindex):
// for the customer whose order it is, the browser that placed it, or a staff member with `orders.invoice`; anyone else
// gets the order page's log-in prompt. Switched off by the owner (`account.invoice`): no such page.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InvoicePage } from '@/components/shop/account/InvoicePage';
import { OrderPrompt } from '@/components/shop/account/OrderPage';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { invoiceNumber } from '@/lib/shop/invoice';
import { loadInvoice } from '@/lib/shop/invoice-load';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

const numberOf = async (params: Promise<{ number: string }>) => decodeURIComponent((await params).number).slice(0, 40);

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const c = await shopContext();
  const set = (await readPageSettings(['account.invoice'] as const, c.storeId))['account.invoice'];
  const invoice = invoiceNumber(set.number, await numberOf(params));
  return { ...(await shopMetadata(c, 'account', c.t('account.invoice.pageTitle', { invoice }))), robots: { index: false, follow: false } };
}

export default async function Invoice({ params }: { params: Promise<{ number: string }> }) {
  const number = await numberOf(params);
  const c = await shopContext();
  const inv = await loadInvoice(c, number);
  if (inv.kind === 'off') notFound();
  if (inv.kind === 'prompt') return <OrderPrompt c={c} number={number} signedIn={inv.signedIn} />;
  return <InvoicePage c={c} r={inv.receipt} v={inv.view} download={inv.download} />;
}
