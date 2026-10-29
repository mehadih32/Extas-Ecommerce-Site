// S11 · PR 220 — the URL and canonical rules (Blueprint C12.1, GOOGLE-TRAFFIC-PLAN §1.2–1.4): every page has a kind,
// private pages never; a page is listed only on the primary domain with the shop open; hreflang pairs only listable,
// ready twins (with x-default → English); capitals move to lower case except in private addresses.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { languagesOf, lowerCaseTarget, pageIndexable, pageTypeOf, PRIVATE_FAMILIES, robotsOf } from './indexing';

const policy = registry['seo.indexing'].default;
const open = { ...policy, searchEngines: true };

describe('pageTypeOf', () => {
  it('maps every page key the shop gives to its kind, with the owner`s product prefix', () => {
    expect(pageTypeOf('home', '/p')).toBe('home');
    expect(pageTypeOf('collections/polos', '/p')).toBe('category');
    expect(pageTypeOf('p/essential-pique-polo', '/p')).toBe('product');
    expect(pageTypeOf('shirts/oxford', '/shirts/')).toBe('product');
    expect(pageTypeOf('combo/sample-polo-chino-set', '/p')).toBe('combo');
    expect(pageTypeOf('combos', '/p')).toBe('combosHub');
    expect(pageTypeOf('combos/sample-polo-pairs', '/p')).toBe('comboList');
    expect(pageTypeOf('combos/build-your-own', '/p')).toBe('setBuilder');
    expect(pageTypeOf('help-delivery', '/p')).toBe('help');
    expect(pageTypeOf('search', '/p')).toBe('search');
  });

  it('private pages and "Coming soon" have no kind: they are never listed', () => {
    for (const k of ['bag', 'checkout', 'account', 'login', 'wishlist', 'bulk-order', 'soon-journal', 'soon-help', 'soon-combos']) expect(pageTypeOf(k, '/p'), k).toBeNull();
    expect(PRIVATE_FAMILIES).toEqual(expect.arrayContaining(['bag', 'checkout', 'account', 'pay', 'bulk-order']));
  });
});

describe('robots and hreflang', () => {
  it('nothing is listed while search engines are off (the default) or on the preview host', () => {
    const indexable = pageIndexable(policy, 'product');
    expect(indexable).toBe(true);
    expect(robotsOf({ policy, indexable, lang: 'en', bnReady: true, onPrimary: true })).toEqual({ index: false, follow: true });
    expect(robotsOf({ policy: open, indexable, lang: 'en', bnReady: true, onPrimary: false })).toEqual({ index: false, follow: true });
    expect(robotsOf({ policy: open, indexable, lang: 'en', bnReady: true, onPrimary: true })).toEqual({ index: true, follow: true });
  });

  it('a Bengali twin is listed only once it is ready; a page that says no or an unticked kind never', () => {
    expect(robotsOf({ policy: open, indexable: true, lang: 'bn', bnReady: false, onPrimary: true }).index).toBe(false);
    expect(robotsOf({ policy: open, indexable: true, lang: 'bn', bnReady: true, onPrimary: true }).index).toBe(true);
    expect(pageIndexable(open, 'product', false)).toBe(false);
    expect(pageIndexable(open, 'search')).toBe(false);
    expect(pageIndexable(open, null)).toBe(false);
    expect(pageIndexable({ ...open, pages: { ...open.pages, search: true } }, 'search')).toBe(true);
  });

  it('hreflang names both twins and x-default → English, only for a listable page with its Bengali twin ready', () => {
    expect(languagesOf('/p/pique-polo', { indexable: true, bnReady: true, xDefault: 'en' })).toEqual({ en: '/p/pique-polo', bn: '/bn/p/pique-polo', 'x-default': '/p/pique-polo' });
    expect(languagesOf('/', { indexable: true, bnReady: true, xDefault: 'en' })).toEqual({ en: '/', bn: '/bn', 'x-default': '/' });
    expect(languagesOf('/p/pique-polo', { indexable: true, bnReady: true, xDefault: 'none' })).toEqual({ en: '/p/pique-polo', bn: '/bn/p/pique-polo' });
    expect(languagesOf('/p/pique-polo', { indexable: true, bnReady: false, xDefault: 'en' })).toBeUndefined();
    expect(languagesOf('/search', { indexable: false, bnReady: true, xDefault: 'en' })).toBeUndefined();
  });
});

describe('lowerCaseTarget', () => {
  it('moves a public page with capitals to its lower-case address, in both languages', () => {
    expect(lowerCaseTarget('/P/Pique-Polo')).toBe('/p/pique-polo');
    expect(lowerCaseTarget('/bn/Collections/Polos')).toBe('/bn/collections/polos');
    expect(lowerCaseTarget('/BN/combos')).toBe('/bn/combos');
  });

  it('leaves lower-case addresses, private addresses (order numbers, pay tokens) and %-escapes alone', () => {
    expect(lowerCaseTarget('/p/pique-polo')).toBeNull();
    expect(lowerCaseTarget('/account/orders/EX-1042')).toBeNull();
    expect(lowerCaseTarget('/bn/account/orders/EX-1042')).toBeNull();
    expect(lowerCaseTarget('/checkout/thanks/EX-1042')).toBeNull();
    expect(lowerCaseTarget('/pay/AbCdEf')).toBeNull();
    expect(lowerCaseTarget('/p/%E0%A6%AA')).toBeNull();
  });
});
