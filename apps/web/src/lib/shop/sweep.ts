// PR 86 — the light-sweep system (Blueprint D1.5, demo 89t-shimmer.js): the house motion, a slow sheen crossing an
// element, drawn by each element's own stylesheet. This file is the one place that knows every sweep of the shop and
// turns the owner's switches (`shop.sweep`, plus the product page's own `pdp.sweep`) into one small stylesheet: a
// sweep switched off is hidden, the Add to Bag sweep (off as designed) is drawn once switched on, and a button with its
// own switch keeps its sweep while "all other green buttons" are off. At the defaults it writes nothing at all, so the
// shop looks exactly as designed. Reduced motion always wins: everything it turns on sits inside
// `prefers-reduced-motion: no-preference`.
// PR 598 — the Shimmer control: each lit shimmer's speed (its designed pass time times the owner's factor) and strength
// (a share of its designed brightness, never more) from `shop.shimmer`, also only under `no-preference`. A button
// under "all other green buttons" keeps its own speed and strength when that row is tuned and its own is not.
import { SHOP_SWEEPS, SHIMMERS, type Shimmer, type ShopShimmerSettings, type ShopSweep, type ShopSweepSettings } from '@extas/settings';

interface SweepTarget {
  /** The sweep's own pseudo-elements (or element), as the stylesheets draw them. */
  sel: readonly string[];
  /** Drawn only once switched on (the demo's `def:false`). */
  offByDesign?: boolean;
  /** A button under "all other green buttons": its animation, per selector, to put back when that switch is off. */
  back?: readonly string[];
  /** The designed pass time per selector, in seconds, as the stylesheets draw it (one value = every selector). */
  dur: readonly number[];
}

const CTA = 'ctaSheenBg 7s ease-in-out 2s infinite'; // hardcode-ok: the green buttons' sweep as the stylesheets draw it (D1.5: 7 s)
const CONFIRM = 'coSheen 6.5s ease-in-out 1.5s infinite'; // hardcode-ok: the checkout button's own sweep (checkout.css)

/** Every sweep of the shop, by its switch (demo SHIM_ITEMS, with the app's own selectors). */
export const SWEEP_TARGETS: Readonly<Record<ShopSweep, SweepTarget>> = {
  checkout: {
    sel: ['[data-testid="bag-summary"] .btn-primary:not(:disabled)::after', '.bg-mbar .btn-primary:not(:disabled)::after', '.co-confirm.btn-primary:not(:disabled)::after'],
    back: [CTA, CTA, CONFIRM],
    dur: [7, 7, 6.5], // hardcode-ok: bag.css / checkout.css pass times
  },
  continueShopping: { sel: ['.bg-page .bg-title .bg-cont::after'], dur: [7] }, // hardcode-ok: bag.css
  freeLabel: { sel: ['.bg-freeb::after'], dur: [7] }, // hardcode-ok: bag.css
  addToBag: { sel: ['.pdp-ctas .btn-addbag::after', '.dkb-bar .btn-addbag::after'], offByDesign: true, dur: [7] }, // hardcode-ok: pdp.css
  orderNow: {
    sel: ['.pdp-ctas .btn-primary:not(:disabled)::after', '.pdp-mbar .btn-primary:not(:disabled)::after', '.dkb-bar .btn-primary:not(:disabled)::after'],
    back: [CTA, CTA, CTA],
    dur: [7], // hardcode-ok: shop.css
  },
  buttons: { sel: ['.btn-primary:not(:disabled)::after'], dur: [7] }, // hardcode-ok: shop.css
  logo: { sel: ['.hdr .logo::after'], dur: [3.4] }, // hardcode-ok: shop.css
  checkoutHelp: { sel: ['.co-help.co-help::after'], dur: [7] }, // hardcode-ok: checkout.css
  checkoutNeed: { sel: ['.co-confirm.co-need-on::after'], dur: [5.5] }, // hardcode-ok: checkout.css
  accountOffer: { sel: ['.acc-ob::after'], dur: [9] }, // hardcode-ok: account.css
  announce: { sel: ['.announce::after'], dur: [9] }, // hardcode-ok: shop.css
  footerPay: { sel: ['.ftr-pay-sheen'], dur: [7] }, // hardcode-ok: shop.css
};

/** The product page's own sweeps (switched one by one in `pdp.sweep`); the master switch stops them too. */
const PDP_SWEEPS = ['.sweep.sweep.sweep::after', '.pdp-page .pdp-pills.shine .size-pill::after'] as const;

/** Every shimmer the Shimmer control tunes: the shop's sweeps and the product page's words and size boxes. */
export const SHIMMER_TARGETS: Readonly<Record<Shimmer, SweepTarget>> = {
  ...SWEEP_TARGETS,
  pdpWords: { sel: [PDP_SWEEPS[0]], dur: [3.2] }, // hardcode-ok: pdp.css
  pdpPills: { sel: [PDP_SWEEPS[1]], dur: [4.6] }, // hardcode-ok: pdp.css
};

/** A shimmer's factors: its pass time and its brightness (1 = as designed). */
export function shimmerFactors(t: ShopShimmerSettings, id: Shimmer): { time: number; light: number } {
  const v = t.items[id];
  if (!v) return { time: 1, light: 1 };
  const time = v.speed === 'slow' ? t.slow : v.speed === 'fast' ? t.fast : 1;
  const light = v.strength === 'medium' ? t.medium : v.strength === 'soft' ? t.soft : 1;
  return { time, light: Math.min(1, light) };
}

/** The speed and strength rules of the lit shimmers (inside the reduced-motion guard by the caller). */
function tuneRules(s: ShopSweepSettings, t: ShopShimmerSettings): string[] {
  const out: string[] = [];
  const buttons = shimmerFactors(t, 'buttons');
  const buttonsTuned = s.items.buttons && (buttons.time !== 1 || buttons.light !== 1);
  for (const id of SHIMMERS) {
    const lit = id === 'pdpWords' || id === 'pdpPills' ? s.on : s.on && s.items[id];
    if (!lit) continue;
    const tg = SHIMMER_TARGETS[id];
    const f = shimmerFactors(t, id);
    if (f.time === 1 && f.light === 1 && !(tg.back && buttonsTuned)) continue;
    tg.sel.forEach((sel, i) => {
      const d = tg.dur[i] ?? tg.dur[0]!;
      out.push(`${P([sel])}{animation-duration:${+(d * f.time).toFixed(2)}s!important;opacity:${+f.light.toFixed(2)}!important}`);
    });
  }
  return out;
}

const P = (sels: readonly string[]) => sels.map((s) => `html body ${s}`).join(',');

/** The stylesheet for the owner's sweep switches and shimmer tune: '' when everything is as designed. */
export function sweepCss(s: ShopSweepSettings, tune?: ShopShimmerSettings): string {
  const off: string[] = [];
  const back: string[] = [];
  const lit = (id: ShopSweep) => s.on && s.items[id];
  for (const id of SHOP_SWEEPS) {
    const t = SWEEP_TARGETS[id];
    if (!lit(id)) {
      if (!t.offByDesign) off.push(P(t.sel));
      continue;
    }
    if (t.offByDesign) back.push(`${P(t.sel)}{display:block!important}`);
    if (t.back && !lit('buttons')) t.sel.forEach((sel, i) => back.push(`${P([sel])}{display:block!important;animation:${t.back![i]}!important}`));
  }
  if (!s.on) off.push(P(PDP_SWEEPS));
  if (tune) back.push(...tuneRules(s, tune));
  let css = '';
  if (off.length) css += `${off.join(',')}{display:none!important;animation:none!important}`;
  if (back.length) css += `@media (prefers-reduced-motion:no-preference){${back.join('')}}`;
  return css;
}
