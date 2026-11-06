import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motionSettings, shimmerSettings, SHIMMERS, SHOP_SWEEPS, type ShopShimmerSettings, type ShopSweepSettings } from '@extas/settings';
import { SHIMMER_TARGETS, shimmerFactors, sweepCss, SWEEP_TARGETS } from './sweep';
import { sweepClass } from './sweep-class';

const DEF = motionSettings['shop.sweep'].default;
const withItem = (id: keyof ShopSweepSettings['items'], on: boolean): ShopSweepSettings => ({ ...DEF, items: { ...DEF.items, [id]: on } });

/** Every stylesheet of the shop, to prove each switch names a sweep that is really drawn. */
function shopCss(): string {
  const root = join(__dirname, '../..');
  const files = [
    'app/(shop)/shop.css',
    'components/shop/bag/bag.css',
    'components/shop/product/pdp.css',
    'components/shop/checkout/checkout.css',
    'components/shop/account/account.css',
  ];
  return files.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
}

describe('PR 86 · the light-sweep switches', () => {
  it('ships as designed: every sweep on but Add to Bag, and then writes nothing at all', () => {
    expect(DEF.on).toBe(true);
    expect(Object.entries(DEF.items).filter(([, v]) => !v).map(([k]) => k)).toEqual(['addToBag']);
    expect(sweepCss(DEF)).toBe('');
  });

  it('every switch names a sweep the shop\'s stylesheets really draw', () => {
    const css = shopCss();
    for (const id of SHOP_SWEEPS) {
      for (const sel of SWEEP_TARGETS[id].sel) {
        const last = sel.split(' ').at(-1)!.replace(/:not\(:disabled\)/, '').replace(/::after$/, '');
        expect(css, `${id}: ${sel}`).toContain(last.split('.').filter(Boolean).at(-1)!);
      }
    }
    for (const kf of ['ctaSheenBg', 'coSheen']) expect(css).toContain(`@keyframes ${kf}`);
  });

  it('one switch off hides that sweep only', () => {
    const css = sweepCss(withItem('logo', false));
    expect(css).toBe('html body .hdr .logo::after{display:none!important;animation:none!important}');
  });

  it('the master switch stops every sweep, the product page\'s own too, and puts nothing back', () => {
    const css = sweepCss({ ...DEF, on: false });
    for (const id of SHOP_SWEEPS) if (id !== 'addToBag') for (const sel of SWEEP_TARGETS[id].sel) expect(css).toContain(`html body ${sel}`);
    expect(css).toContain('html body .sweep.sweep.sweep::after');
    expect(css).toContain('.pdp-pills.shine .size-pill::after');
    expect(css).not.toContain('prefers-reduced-motion');
  });

  it('Add to Bag switched on is drawn, and only for a customer who has not asked for less motion', () => {
    const css = sweepCss(withItem('addToBag', true));
    expect(css).toBe('@media (prefers-reduced-motion:no-preference){html body .pdp-ctas .btn-addbag::after,html body .dkb-bar .btn-addbag::after{display:block!important}}');
  });

  it('"all other green buttons" off: the checkout and Order Now buttons keep their own sweep', () => {
    const css = sweepCss(withItem('buttons', false));
    expect(css.startsWith('html body .btn-primary:not(:disabled)::after{display:none!important')).toBe(true);
    expect(css).toContain('html body .co-confirm.btn-primary:not(:disabled)::after{display:block!important;animation:coSheen');
    expect(css).toContain('html body .pdp-mbar .btn-primary:not(:disabled)::after{display:block!important;animation:ctaSheenBg');
    // switched off themselves as well: nothing put back
    const both = sweepCss({ ...DEF, items: { ...DEF.items, buttons: false, checkout: false, orderNow: false } });
    expect(both).not.toContain('display:block');
  });

  it('a word gets its sweep through one shared class', () => {
    expect(sweepClass(true)).toBe(' sweep');
    expect(sweepClass(false)).toBe('');
  });
});

describe('PR 598 · the Shimmer control (speed and strength)', () => {
  const TUNE = shimmerSettings['shop.shimmer'].default;
  const tuned = (items: ShopShimmerSettings['items']): ShopShimmerSettings => ({ ...TUNE, items });

  it('as shipped it writes nothing at all, and every shimmer has a designed pass time per selector', () => {
    expect(sweepCss(DEF, TUNE)).toBe('');
    for (const id of SHIMMERS) {
      const t = SHIMMER_TARGETS[id];
      expect(t.dur.length === 1 || t.dur.length === t.sel.length).toBe(true);
      for (const d of t.dur) expect(shopCss()).toMatch(new RegExp(`animation:\\s*[a-zA-Z]*\\s*${String(d).replace('.', '\\.')}s`));
    }
  });

  it('slow and soft: the designed time times the factor and a share of the light, only without reduced motion', () => {
    const css = sweepCss(DEF, tuned({ logo: { speed: 'slow', strength: 'soft' } }));
    expect(css).toBe('@media (prefers-reduced-motion:no-preference){html body .hdr .logo::after{animation-duration:5.1s!important;opacity:0.5!important}}');
    expect(shimmerFactors(tuned({ logo: { speed: 'fast', strength: 'medium' } }), 'logo')).toEqual({ time: 0.65, light: 0.75 });
  });

  it('a switched-off shimmer is not tuned, and the master switch off tunes nothing', () => {
    expect(sweepCss(withItem('logo', false), tuned({ logo: { speed: 'slow', strength: 'soft' } }))).not.toContain('opacity');
    expect(sweepCss({ ...DEF, on: false }, tuned({ pdpWords: { speed: 'fast', strength: 'full' } }))).not.toContain('animation-duration');
  });

  it('the product page words and size boxes are tuned too', () => {
    const css = sweepCss(DEF, tuned({ pdpWords: { speed: 'fast', strength: 'full' }, pdpPills: { speed: 'normal', strength: 'medium' } }));
    expect(css).toContain('html body .sweep.sweep.sweep::after{animation-duration:2.08s!important;opacity:1!important}');
    expect(css).toContain('html body .pdp-page .pdp-pills.shine .size-pill::after{animation-duration:4.6s!important;opacity:0.75!important}');
  });

  it('green buttons tuned: the checkout and Order Now buttons keep their own designed time', () => {
    const css = sweepCss(DEF, tuned({ buttons: { speed: 'slow', strength: 'soft' } }));
    expect(css).toContain('html body .btn-primary:not(:disabled)::after{animation-duration:10.5s!important;opacity:0.5!important}');
    expect(css).toContain('html body .co-confirm.btn-primary:not(:disabled)::after{animation-duration:6.5s!important;opacity:1!important}');
  });
});
