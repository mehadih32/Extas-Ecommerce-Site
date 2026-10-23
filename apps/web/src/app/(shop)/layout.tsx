// S02 — every shop page sits in this wrapper: the theme of the day as CSS variables (PR 82 / 501), the page language
// (PR 84) and the shop's own stylesheet and fonts. The admin and the progress page never load any of it.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '../../fonts/shop.css';
import './shop.css';
import './shop-app.css';
import { shopContext } from '@/lib/shop/context';
import { BengaliFontWarm } from '@/components/shop/BengaliFontWarm';
import { BENGALI_FONT_COOKIE, bengaliFontFaces, bengaliFontUrls, shopThemeFontPreloads } from '@/lib/shop/font-preload';
import { hrefIn } from '@/lib/shop/lang';

/** How long the "Bengali fonts are cached" cookie lasts: the files are immutable, so a year (technical, not a policy). */
const BENGALI_FONT_COOKIE_AGE = 31_536_000; // hardcode-ok: technical cookie lifetime in seconds (one year)

export default async function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  // The Bengali shop switched off: its addresses lead to the English twin.
  if (c.lang === 'bn' && !c.s['language.bengali.enabled']) redirect(hrefIn('en', c.path));
  // The first screen's faces start loading with the page, so they are in before the first paint (the demo's type).
  // Follow-up 23: the shop's own faces are preloaded by the root layout already; here only what the theme adds.
  const fonts = shopThemeFontPreloads(c.theme.tokens, c.lang);
  // Follow-up 23: the Bengali faces only once the browser has their files (else the phone's own Bengali font draws
  // the letters); a Bengali page fetches them when idle. The faces' text is built from the app's own file addresses.
  const bnCached = (await cookies()).get(BENGALI_FONT_COOKIE)?.value === '1';
  // Token values are checked (hex colours, known font stacks), so they are safe inside a style element.
  const css = `.shop{${c.theme.css}}html,body{background:${c.theme.tokens.bg};overscroll-behavior-x:none;overscroll-behavior-y:none}`;
  return (
    <div id="app" className="shop" data-theme={c.theme.choice.preset} lang={c.lang} data-large-text={c.s['theme.largeText'] ? '1' : undefined}>
      {fonts.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {bnCached ? <style dangerouslySetInnerHTML={{ __html: bengaliFontFaces() }} /> : null}
      {!bnCached && c.lang === 'bn' ? (
        <BengaliFontWarm urls={bengaliFontUrls()} cookie={BENGALI_FONT_COOKIE} maxAgeSeconds={BENGALI_FONT_COOKIE_AGE} />
      ) : null}
      {children}
    </div>
  );
}
