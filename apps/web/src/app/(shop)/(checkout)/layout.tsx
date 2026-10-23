// PR 40 — the checkout shell (demo 03-layout.js layout(…, 'checkout')): the skip link, the slim checkout header and
// the page. No footer, no bottom bar and no floating WhatsApp disc, so nothing pulls the shopper away mid-checkout.
// PR 125/126: once the order is placed (its payment page, the thank-you page) the bag is empty: the header's first
// button goes home instead of back to the bag, and the last step is the one lit.
import { ShellEffects } from '@/components/shop/ShellEffects';
import { SlimHeader } from '@/components/shop/SlimHeader';
import { shopContext } from '@/lib/shop/context';
import { ROUTES } from '@/lib/shop/routes';

export default async function CheckoutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  return (
    <>
      <a className="skip" href="#main" data-act="skip">
        {c.t('skip')}
      </a>
      <SlimHeader c={c} done={c.path.startsWith(`${ROUTES.checkout}/`)} />
      <main className="page" id="main" tabIndex={-1}>
        {children}
      </main>
      <ShellEffects />
    </>
  );
}
