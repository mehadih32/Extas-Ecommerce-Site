// S02 — every shop page sits in this wrapper: the theme of the day as CSS variables (PR 82 / 501), the page language
// (PR 84) and the shop's own stylesheet and fonts. The admin and the progress page never load any of it.
import { redirect } from 'next/navigation';
import '../../fonts/shop.css';
import './shop.css';
import './shop-app.css';
import { shopContext } from '@/lib/shop/context';
import { shopFontPreloads } from '@/lib/shop/font-preload';
import { hrefIn } from '@/lib/shop/lang';

export default async function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  // The Bengali shop switched off: its addresses lead to the English twin.
  if (c.lang === 'bn' && !c.s['language.bengali.enabled']) redirect(hrefIn('en', c.path));
  // The first screen's faces start loading with the page, so `font-display: optional` keeps them (the demo's type).
  const fonts = shopFontPreloads(c.theme.tokens, c.lang);
  // Token values are checked (hex colours, known font stacks), so they are safe inside a style element.
  const css = `.shop{${c.theme.css}}html,body{background:${c.theme.tokens.bg};overscroll-behavior-x:none;overscroll-behavior-y:none}`;
  return (
    <div id="app" className="shop" data-theme={c.theme.choice.preset} lang={c.lang} data-large-text={c.s['theme.largeText'] ? '1' : undefined}>
      {fonts.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </div>
  );
}
