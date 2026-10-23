// PR 86 — the light-sweep system (Blueprint D1.5, demo 89t-shimmer.js): the house motion, a slow sheen crossing an
// element, drawn by each element's own stylesheet. This file is the one place that knows every sweep of the shop and
// turns the owner's switches (`shop.sweep`, plus the product page's own `pdp.sweep`) into one small stylesheet: a
// sweep switched off is hidden, the Add to Bag sweep (off as designed) is drawn once switched on, and a button with its
// own switch keeps its sweep while "all other green buttons" are off. At the defaults it writes nothing at all, so the
// shop looks exactly as designed. Reduced motion always wins: everything it turns on sits inside
// `prefers-reduced-motion: no-preference`. Speed and strength per sweep are PR 598's.
import { SHOP_SWEEPS, type ShopSweep, type ShopSweepSettings } from '@extas/settings';

interface SweepTarget {
  /** The sweep's own pseudo-elements (or element), as the stylesheets draw them. */
  sel: readonly string[];
  /** Drawn only once switched on (the demo's `def:false`). */
  offByDesign?: boolean;
  /** A button under "all other green buttons": its animation, per selector, to put back when that switch is off. */
  back?: readonly string[];
}

const CTA = 'ctaSheenBg 7s ease-in-out 2s infinite'; // hardcode-ok: the green buttons' sweep as the stylesheets draw it (D1.5: 7 s)
const CONFIRM = 'coSheen 6.5s ease-in-out 1.5s infinite'; // hardcode-ok: the checkout button's own sweep (checkout.css)

/** Every sweep of the shop, by its switch (demo SHIM_ITEMS, with the app's own selectors). */
export const SWEEP_TARGETS: Readonly<Record<ShopSweep, SweepTarget>> = {
  checkout: {
    sel: ['[data-testid="bag-summary"] .btn-primary:not(:disabled)::after', '.bg-mbar .btn-primary:not(:disabled)::after', '.co-confirm.btn-primary:not(:disabled)::after'],
    back: [CTA, CTA, CONFIRM],
  },
  continueShopping: { sel: ['.bg-page .bg-title .bg-cont::after'] },
  freeLabel: { sel: ['.bg-freeb::after'] },
  addToBag: { sel: ['.pdp-ctas .btn-addbag::after', '.dkb-bar .btn-addbag::after'], offByDesign: true },
  orderNow: {
    sel: ['.pdp-ctas .btn-primary:not(:disabled)::after', '.pdp-mbar .btn-primary:not(:disabled)::after', '.dkb-bar .btn-primary:not(:disabled)::after'],
    back: [CTA, CTA, CTA],
  },
  buttons: { sel: ['.btn-primary:not(:disabled)::after'] },
  logo: { sel: ['.hdr .logo::after'] },
  checkoutHelp: { sel: ['.co-help.co-help::after'] },
  checkoutNeed: { sel: ['.co-confirm.co-need-on::after'] },
  accountOffer: { sel: ['.acc-ob::after'] },
  announce: { sel: ['.announce::after'] },
  footerPay: { sel: ['.ftr-pay-sheen'] },
};

/** The product page's own sweeps (switched one by one in `pdp.sweep`); the master switch stops them too. */
const PDP_SWEEPS = ['.sweep.sweep.sweep::after', '.pdp-page .pdp-pills.shine .size-pill::after'] as const;

const P = (sels: readonly string[]) => sels.map((s) => `html body ${s}`).join(',');

/** The stylesheet for the owner's sweep switches: '' when everything is as designed. */
export function sweepCss(s: ShopSweepSettings): string {
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
  let css = '';
  if (off.length) css += `${off.join(',')}{display:none!important;animation:none!important}`;
  if (back.length) css += `@media (prefers-reduced-motion:no-preference){${back.join('')}}`;
  return css;
}
