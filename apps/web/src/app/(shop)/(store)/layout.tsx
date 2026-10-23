// PR 40 — the store shell around every shop page except checkout and landing pages (demo 03-layout.js layout()):
// the skip link, the header, the page, the footer, the phone's bottom bar and the floating WhatsApp disc (PR 70: a
// switch, off by default, with a per-page choice and its place — `shell.fab`).
import { StoreFooter } from '@/components/shop/StoreFooter';
import { StoreHeader } from '@/components/shop/StoreHeader';
import { BottomNav } from '@/components/shop/BottomNav';
import { ShellEffects } from '@/components/shop/ShellEffects';
import { WaGlyph } from '@/components/shop/Icon';
import { cookies } from 'next/headers';
import { badgeCount, COUNT_COOKIE } from '@/lib/shop/bag-model';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { fabClass, fabPage, fabShows } from '@/lib/shop/fab';
import { waHref } from '@/lib/shop/links';

export default async function StoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  // PR 70 (Note 3.1): the floating disc is a switch, off — the header's WhatsApp icon does its job. When the owner
  // switches it on, the kinds of page he ticked show it (never the home page, the product page or the bag by default:
  // C3, §49.4, demo FAB_PAGES).
  // ~~C3: off the home page and the bag, every other page has it whenever the number is set~~
  const more = await readPageSettings(['shell.fab', 'shell.menuSubs'] as const, c.storeId);
  const fabSet = more['shell.fab'];
  const waLink = waHref(c.s['contact.whatsapp'], c.t('fab.message', c.vars));
  const fab = fabShows(fabSet, fabPage(c.path, c.s['naming.productPathPrefix']), waLink) ? waLink : null;
  // PR 105: the bag's piece count, from the cookie the bag's API keeps current (a number only; never used for money).
  const bagCount = badgeCount((await cookies()).get(COUNT_COOKIE)?.value);
  return (
    <>
      <a className="skip" href="#main" data-act="skip">
        {c.t('skip')}
      </a>
      <div className="has-bnav">
        <StoreHeader c={c} bagCount={bagCount} menuSubs={more['shell.menuSubs']} />
        <main className="page" id="main" tabIndex={-1}>
          {children}
        </main>
        <StoreFooter c={c} />
        <BottomNav c={c} bagCount={bagCount} />
      </div>
      {fab ? (
        <a className={fabClass(fabSet)} id="wa-fab" href={fab} target="_blank" rel="noopener" aria-label={c.t('fab.label', c.vars)}>
          <WaGlyph size={27} />
        </a>
      ) : null}
      <ShellEffects />
    </>
  );
}
