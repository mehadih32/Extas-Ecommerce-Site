// PR 134 — one order's page, at /account/orders/<number> and /bn/account/orders/<number> (noindex): for the signed-in
// customer whose order it is (any device) or the browser that placed it; anyone else is asked to log in.
// PR 135 — its tracking: the steps, the late flag, the courier, the welcome panel after "Track your order" on the
// thank-you page (`?from=thanks`), and the exact amount for the rider when the owner turns it on.
// PR 136: the invoice row with "Get invoice" (follow-up 147), while the owner keeps invoices on (`account.invoice`).
// PR 65: "Rate & review" under each line of a delivered order, for the customer whose account it is; what he writes
// waits for the shop's check (`reviews.submit`, `reviews.photoReward`).
import type { Metadata } from 'next';
import { OrderPage, OrderPrompt } from '@/components/shop/account/OrderPage';
import { orderReviewBox } from '@/lib/shop/account-review';
import { accountReceipt, checkoutSettings } from '@/lib/shop/checkout';
import { invoiceNumber } from '@/lib/shop/invoice';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'account', c.t('account.order.pageTitle', { number: decodeURIComponent(number) }))), robots: { index: false, follow: false } };
}

export default async function Order({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const number = decodeURIComponent((await params).number).slice(0, 40);
  const fromThanks = (await searchParams).from === 'thanks';
  const c = await shopContext();
  const [{ receipt, signedIn }, s, track] = await Promise.all([
    accountReceipt(c, number),
    checkoutSettings(c.storeId),
    readPageSettings(['account.track.welcome', 'account.track.late', 'account.track.exactAmount', 'account.invoice'] as const, c.storeId),
  ]);
  if (!receipt) return <OrderPrompt c={c} number={number} signedIn={signedIn} />;
  const review = await orderReviewBox(c, receipt.number);
  return (
    <OrderPage
      c={c}
      r={receipt}
      waOn={s['checkout.help.enabled']}
      fromThanks={fromThanks}
      opts={{ welcome: track['account.track.welcome'], late: track['account.track.late'], exact: track['account.track.exactAmount'] }}
      invoiceNo={track['account.invoice'].enabled ? invoiceNumber(track['account.invoice'].number, receipt.number) : null}
      review={review}
    />
  );
}
