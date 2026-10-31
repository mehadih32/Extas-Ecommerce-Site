// S02 — every shop page sits in this wrapper: the theme of the day as CSS variables (PR 82 / 501), the page language
// (PR 84), the owner's sweep switches (PR 86) and the shop's own stylesheet and fonts. The admin and the progress page
// never load any of it.
// S11 · PR 586: the hash forwarder, first in the page: a demo `#/…` link moves on to its live address before anything
// else draws (lib/seo/hash-forward, `seo.hashLinks`).
// S21 · PR 423 (CN-015): the privacy-safe problem recorder (components/shop/ProblemProbe) while `health.problems` is on.
// S11 · PR 233: every shop page carries the Search Console and Bing verification codes as their meta tags
// (lib/seo/verification, `seo.verification`; none while no code is set).
// S11 · PR 234: while `seo.vitals.collect` is on, the page reports its speed (components/shop/VitalsReporter).
// S13 · PR 257: the tracking beacon (components/shop/TrackingBeacon) while `ads.tracking` is on with a page event ticked.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '../../fonts/shop.css';
import './shop.css';
import './shop-app.css';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { hashRulesFor, hashScript } from '@/lib/seo/hash-forward';
import { verificationMetadata } from '@/lib/seo/verification';
import { BengaliFontWarm } from '@/components/shop/BengaliFontWarm';
import { ProblemProbe } from '@/components/shop/ProblemProbe';
import { VitalsReporter } from '@/components/shop/VitalsReporter';
import { TrackingBeacon } from '@/components/shop/TrackingBeacon';
import { BENGALI_FONT_COOKIE, bengaliFontFaces, bengaliFontUrls, shopThemeFontPreloads } from '@/lib/shop/font-preload';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { sweepCss } from '@/lib/shop/sweep';

/** How long the "Bengali fonts are cached" cookie lasts: the files are immutable, so a year (technical, not a policy). */
const BENGALI_FONT_COOKIE_AGE = 31_536_000; // hardcode-ok: technical cookie lifetime in seconds (one year)

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const { 'seo.verification': codes } = await readPageSettings(['seo.verification'] as const, c.storeId);
  const verification = verificationMetadata(codes);
  return verification ? { verification } : {};
}

export default async function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await shopContext();
  const {
    'seo.hashLinks': hashLinks,
    'health.problems': problems,
    'seo.vitals': vitals,
    'ads.tracking': tracking,
  } = await readPageSettings(['seo.hashLinks', 'health.problems', 'seo.vitals', 'ads.tracking'] as const, c.storeId);
  const trackView = tracking.on && tracking.events.view;
  const trackCheckout = tracking.on && tracking.events.checkout;
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
  // PR 86: the owner's sweep switches, as one small stylesheet of fixed selectors ('' while every sweep is as designed).
  const sweep = sweepCss(c.s['shop.sweep']);
  return (
    <div id="app" className="shop" data-theme={c.theme.choice.preset} lang={c.lang} data-large-text={c.s['theme.largeText'] ? '1' : undefined}>
      {hashLinks.forward ? <script data-hash-forward="" dangerouslySetInnerHTML={{ __html: hashScript(hashRulesFor(c.s['naming.productPathPrefix'])) }} /> : null}
      {fonts.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {sweep ? <style data-sweeps="" dangerouslySetInnerHTML={{ __html: sweep }} /> : null}
      {bnCached ? <style dangerouslySetInnerHTML={{ __html: bengaliFontFaces() }} /> : null}
      {!bnCached && c.lang === 'bn' ? (
        <BengaliFontWarm urls={bengaliFontUrls()} cookie={BENGALI_FONT_COOKIE} maxAgeSeconds={BENGALI_FONT_COOKIE_AGE} />
      ) : null}
      {problems.enabled ? (
        <ProblemProbe
          cfg={{ storeId: c.storeId, slowRequestMs: problems.slowRequestMs, slowLoadMs: problems.slowLoadMs, rageClicks: problems.rageClicks, formErrorRepeats: problems.formErrorRepeats, maxPerPage: problems.maxPerPage }}
        />
      ) : null}
      {trackView || trackCheckout ? <TrackingBeacon cfg={{ productPrefix: c.s['naming.productPathPrefix'], checkoutPath: ROUTES.checkout, view: trackView, checkout: trackCheckout }} /> : null}
      {children}
      {vitals.collect ? <VitalsReporter share={vitals.share} /> : null}
    </div>
  );
}
