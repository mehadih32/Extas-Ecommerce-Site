import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motionSettings, SHOP_SWEEPS, type ShopSweepSettings } from '@extas/settings';
import { sweepCss, SWEEP_TARGETS } from './sweep';
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
