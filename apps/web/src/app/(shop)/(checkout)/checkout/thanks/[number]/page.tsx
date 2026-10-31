// PR 126 — the thank-you page, at /checkout/thanks/<number> and /bn/checkout/thanks/<number>. Only the browser that
// placed the order sees it (the bag cookie's visitor id); anyone else, or an unknown number, gets "Order not found".
// Never a search result. PR 87: the celebration over it, only while the owner has it on for the occasion's days (or
// `?celebrate=preview`); otherwise not one byte of it reaches the browser.
// PR 128: "Complete your look" is read for the order once it is known to be his (`thanks.look`, off by default).
// PR 193: the holiday's "ships from …" or "may arrive after Eid" in place of the hours, as the checkout said it.
import type { Metadata } from 'next';
import { Celebrate } from '@/components/shop/checkout/Celebrate';
import { ThanksNotFound, ThanksPage } from '@/components/shop/checkout/ThanksPage';
import { CELEBRATE_QUERY, celebrationFor } from '@/lib/shop/celebrate';
import { checkoutSettings, currentEta, currentReceipt } from '@/lib/shop/checkout';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { thanksLook } from '@/lib/shop/thanks-look';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'checkout', c.t('checkout.ty.pageTitle'))), robots: { index: false, follow: false } };
}

export default async function Thanks({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { number } = await params;
  const c = await shopContext();
  const [r, s, more] = await Promise.all([
    currentReceipt(c, decodeURIComponent(number)),
    checkoutSettings(c.storeId),
    readPageSettings(['thanks.page', 'account.invoice', 'thanks.celebrate'], c.storeId),
  ]);
  if (!r) return <ThanksNotFound c={c} />;
  const [look, eta] = await Promise.all([thanksLook(c.storeId, r), currentEta(c, r.number)]);
  const q = (await searchParams)[CELEBRATE_QUERY];
  const cel = more['thanks.celebrate'];
  const plan = celebrationFor(cel, c.today, r.number, typeof q === 'string' ? q : null, cel.text?.[c.lang] || c.t('celebrate.text'));
  return (
    <>
      <ThanksPage c={c} r={r} waOn={s['checkout.help.enabled']} more={more['thanks.page']} tryOn={s['checkout.tryOn.enabled']} accountCard={s['account.thanksCard.enabled']} invoice={more['account.invoice'].enabled} look={look} eta={eta} />
      {plan ? <Celebrate plan={plan} /> : null}
    </>
  );
}
