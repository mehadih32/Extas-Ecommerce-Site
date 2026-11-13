// S02 — every shop page sits in this wrapper: the theme of the day as CSS variables (PR 82 / 501), the page language
// (PR 84), the owner's sweep switches (PR 86) and the shop's own stylesheet and fonts. The admin and the progress page
// never load any of it.
// S11 · PR 586: the hash forwarder, first in the page: a demo `#/…` link moves on to its live address before anything
// else draws (lib/seo/hash-forward, `seo.hashLinks`). PR 597 follow-up (696): drawn by HashForwardScript, so a copy
// React makes in the browser (the shop's "page not found") is inert and React does not warn about a script tag.
// S21 · PR 423 (CN-015): the privacy-safe problem recorder (components/shop/ProblemProbe) while `health.problems` is on.
// S11 · PR 233: every shop page carries the Search Console and Bing verification codes as their meta tags
// (lib/seo/verification, `seo.verification`; none while no code is set).
// S11 · PR 234: while `seo.vitals.collect` is on, the page reports its speed (components/shop/VitalsReporter).
// S13 · PR 257: the tracking beacon (components/shop/TrackingBeacon) while `ads.tracking` is on with a page event ticked.
// S15 · PR 338 (Blueprint D5): the owner's own analytics beacon (components/shop/AnalyticsBeacon) while
// `analytics.events` is on — runs beside the ad-tracking beacon, never instead of it; the two feed different readers.
// S06 · PR 556: while the in-transit duplicate notice is on, the visit's campaign is kept in the tab (CampaignKeep).
// S02 · PR 79: while `language.frontEdit` is on, the switch for editing the page's words (WordsEditLoader; the panel
// itself loads only on a page opened with ?words=edit).
// S02 · PR 600: while `shop.pageEdit` is on, the signed-in owner's on-page edit bar (PageEditBar; lib/website/page-edit-
// shop decides, from the admin session, so a customer's page carries nothing for it).
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
import { HashForwardScript } from '@/components/shop/HashForwardScript';
import { ProblemProbe } from '@/components/shop/ProblemProbe';
import { VitalsReporter } from '@/components/shop/VitalsReporter';
import { TrackingBeacon } from '@/components/shop/TrackingBeacon';
import { AnalyticsBeacon } from '@/components/shop/AnalyticsBeacon';
import { BehaviourBeacon } from '@/components/shop/BehaviourBeacon';
import { CampaignKeep } from '@/components/shop/CampaignKeep';
import { WordsEditLoader } from '@/components/shop/WordsEditLoader';
import { PageEditBar } from '@/components/shop/PageEditBar';
import { pageKindOf } from '@/lib/website/page-edit-model';
import { pageEditState } from '@/lib/website/page-edit-shop';
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
    'checkout.transitDuplicate': transit,
    'language.frontEdit': frontEdit,
    'analytics.events': analyticsEvents,
    'analytics.visitors': analyticsVisitors,
    'analytics.behaviour': analyticsBehaviour,
  } = await readPageSettings(['seo.hashLinks', 'health.problems', 'seo.vitals', 'ads.tracking', 'checkout.transitDuplicate', 'language.frontEdit', 'analytics.events', 'analytics.visitors', 'analytics.behaviour'] as const, c.storeId);
  // PR 600: the owner's on-page edit bar (null for everyone else; nothing is read without an admin session)
  const pageEdit = await pageEditState();
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
  const sweep = sweepCss(c.s['shop.sweep'], c.s['shop.shimmer']);
  return (
    <div id="app" className="shop" data-theme={c.theme.choice.preset} lang={c.lang} data-large-text={c.s['theme.largeText'] ? '1' : undefined}>
      {hashLinks.forward ? <HashForwardScript code={hashScript(hashRulesFor(c.s['naming.productPathPrefix']))} /> : null}
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
      {analyticsEvents.on ? <AnalyticsBeacon cfg={{ productPrefix: c.s['naming.productPathPrefix'], collect: analyticsVisitors.collect }} /> : null}
      {analyticsBehaviour.collect ? <BehaviourBeacon cfg={{ productPrefix: c.s['naming.productPathPrefix'] }} /> : null}
      {transit.enabled ? <CampaignKeep /> : null}
      {children}
      {vitals.collect ? <VitalsReporter share={vitals.share} /> : null}
      {frontEdit.enabled ? <WordsEditLoader /> : null}
      {pageEdit ? <PageEditBar edit={pageEdit.edit} page={pageKindOf(c.path, c.s['naming.productPathPrefix'])} lang={c.lang} /> : null}
    </div>
  );
}
