// PR 40 — the store shell around every shop page except checkout and landing pages (demo 03-layout.js layout()):
// the skip link, the header, the page, the footer, the phone's bottom bar and the floating WhatsApp disc.
import { StoreFooter } from '@/components/shop/StoreFooter';
import { StoreHeader } from '@/components/shop/StoreHeader';
import { BottomNav } from '@/components/shop/BottomNav';
import { ShellEffects } from '@/components/shop/ShellEffects';
import { WaGlyph } from '@/components/shop/Icon';
import { cookies } from 'next/headers';
import { badgeCount, COUNT_COOKIE } from '@/lib/shop/bag-model';
import { shopContext } from '@/lib/shop/context';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';

export default async function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  // C3: the floating disc stays off the home page (the owner's call) and off the bag (PR 107: the phone's checkout bar
  // and the summary own that corner) — every other page has it.
  const fab = c.path !== '/' && c.path !== ROUTES.bag ? waHref(c.s['contact.whatsapp'], c.t('fab.message', c.vars)) : null;
  // PR 105: the bag's piece count, from the cookie the bag's API keeps current (a number only; never used for money).
  const bagCount = badgeCount((await cookies()).get(COUNT_COOKIE)?.value);
  return (
    <>
      <a className="skip" href="#main" data-act="skip">
        {c.t('skip')}
      </a>
      <div className="has-bnav">
        <StoreHeader c={c} bagCount={bagCount} />
        <main className="page" id="main" tabIndex={-1}>
          {children}
        </main>
        <StoreFooter c={c} />
        <BottomNav c={c} bagCount={bagCount} />
      </div>
      {fab ? (
        <a className="wa-fab" id="wa-fab" href={fab} target="_blank" rel="noopener" aria-label={c.t('fab.label', c.vars)}>
          <WaGlyph size={27} />
        </a>
      ) : null}
      <ShellEffects />
    </>
  );
}
