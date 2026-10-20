// PR 21, 26, 29, 35 — the product screens' pure part: their messages (both languages, every check and code), money in
// and out, the checklist as text, refusals as text, and the edit form's one save request built from what changed.
import { describe, expect, it } from 'vitest';
import type { NamingView, ProductView } from '@extas/catalogue';
import { PUBLISH_CHECK_KEYS } from '@extas/settings';
import bn from '../../../../messages/admin-products.bn.json';
import en from '../../../../messages/admin-products.en.json';
import adminBn from '../../../../messages/admin.bn.json';
import adminEn from '../../../../messages/admin.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { t, type Dict } from '@/lib/i18n';
import { buildSave, checkText, formatMoney, initialState, moneyOf, refusalText, toMajor, toMinor } from './model';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('product screen messages', () => {
  it('both languages have the same keys, none empty, and English has no Bengali', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const k of keys(en)) {
      expect(t(en, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en, k)), k).toBe(false);
    }
  });

  it('never repeats a key of the admin file (the merge would hide one)', () => {
    const own = new Set(keys(adminEn));
    expect(keys(en).filter((k) => own.has(k))).toEqual([]);
    expect(keys(bn).filter((k) => new Set(keys(adminBn)).has(k))).toEqual([]);
    expect(t(adminDicts.bn, 'products.title')).toBe(t(bn, 'products.title'));
    expect(t(adminDicts.en, 'nav.products')).toBe(t(adminEn, 'nav.products'));
  });

  it('every check has its label, short label, pass text and none text; every status and code has a text', () => {
    for (const d of [bn, en]) {
      for (const k of PUBLISH_CHECK_KEYS) for (const f of ['label', 'short', 'ok', 'none']) expect(t(d, `checks.${k}.${f}`)).not.toBe(`checks.${k}.${f}`);
      for (const s of ['PUBLISHED', 'READY_TO_PUBLISH', 'DRAFT', 'UNPUBLISHED', 'ARCHIVED']) expect(t(d, `products.status.${s}`)).not.toContain('products.');
      for (const c of ['CHECKLIST_FAILED', 'SKU_TAKEN', 'SKU_RETIRED', 'SKU_FORMAT', 'VARIANT_EXISTS', 'SLUG_TAKEN', 'COLOUR_IN_USE', 'CONFLICT', 'NOT_FOUND', 'TOO_LARGE']) expect(t(d, `products.errors.${c}`)).not.toContain('products.');
      for (const s of ['product', 'naming', 'retire', 'variants', 'colours', 'create']) expect(t(d, `products.save.steps.${s}`)).not.toContain('products.');
      for (const r of ['new', 'unpublished', 'live-failing']) expect(t(d, `queue.reason.${r}`)).not.toContain('queue.');
    }
  });
});

describe('money', () => {
  const bdt = moneyOf('BDT', 'en');
  it('reads the minor-unit digits from the currency and converts both ways', () => {
    expect(bdt.digits).toBe(2);
    expect(toMajor(99000, bdt)).toBe('990');
    expect(toMajor(null, bdt)).toBe('');
    expect(toMinor('990', bdt)).toBe(99000);
    expect(toMinor('1,190.5', bdt)).toBe(119050);
    expect(toMinor('', bdt)).toBeNull();
    expect(toMinor('12.345', bdt)).toBeUndefined();
    expect(toMinor('-5', bdt)).toBeUndefined();
    expect(formatMoney(99000, bdt)).toContain('990');
    expect(formatMoney(99000, bdt)).not.toContain('.00');
  });
});

describe('checklist and refusals as text', () => {
  const d = adminDicts.en;
  it('turns detail codes into words', () => {
    expect(checkText(d, { key: 'price', ok: false, details: ['sku:A-1', 'sku:A-2', 'more:3'] })).toBe('Price missing for A-1, A-2, +3 more.');
    expect(checkText(d, { key: 'photos', ok: false, details: ['BACK', 'FRONT:c1', 'count:2/4'] }, () => 'Navy')).toBe('2 of 4 photos; missing: Back, Front · Navy.');
    expect(checkText(d, { key: 'seo', ok: false, details: ['seoTitle.bn', 'metaDescription.en:over'] })).toBe('Fill in: Google title (Bengali), Google description (English) is too long.');
    expect(checkText(d, { key: 'fabric', ok: false, details: ['archived'] })).toBe('Its fabric is archived.');
    expect(checkText(d, { key: 'stock', ok: true, details: [] })).toBe('In stock');
  });
  it('names the checks of CHECKLIST_FAILED and the steps of a stopped save', () => {
    expect(refusalText(d, 'CHECKLIST_FAILED', ['photos', 'sizeChart'])).toBe('Not ready yet — still missing: Photos, Size chart.');
    expect(refusalText(d, 'SKU_TAKEN', ['sku: X-1', 'step:create', 'saved:product'])).toBe('This SKU is already used by another product: sku: X-1 Saved: details. Stopped at: new SKUs.');
    expect(refusalText(d, 'FORBIDDEN', ['step:variants'])).toBe('You do not have permission for this. Nothing was saved (stopped at: prices).');
    expect(refusalText(d, 'something-new')).toBe(t(d, 'errors.server-error'));
  });
});

describe('the edit form save', () => {
  const m = moneyOf('BDT', 'en');
  const field = (value: string, source: 'own' | 'template') => ({ value, source, chars: value.length, max: 60, over: false });
  const naming = {
    productId: 'p',
    status: 'DRAFT',
    nameEn: 'Polo',
    nameBn: null,
    slug: 'polo',
    path: '/p/polo',
    templateSlug: 'polo',
    brand: {},
    brandLine: '',
    seoTitle: { en: field('Polo | Shop', 'template'), bn: field('পোলো', 'own') },
    metaDescription: { en: field('A polo', 'template'), bn: field('', 'template') },
    feedTitle: field('Polo', 'template'),
    warnings: [],
  } as unknown as NamingView;
  const v = (id: string, colour: string | null, size: string | null, price: number | null) => ({
    id,
    sku: id.toUpperCase(),
    colour: colour ? { id: colour, key: colour, nameEn: colour, hex: '#000000' } : null,
    size: size ? { id: size, key: size, label: size, sortOrder: size === 'm' ? 20 : 10 } : null,
    priceMinor: price,
    compareAtMinor: null,
    archived: false,
  });
  const product = {
    id: 'p',
    category: { id: 'cat' },
    fabric: null,
    erpStyleCode: 'PL1',
    descriptionEn: 'Old',
    descriptionBn: null,
    careEn: null,
    careBn: null,
    colours: [
      { colourId: 'navy', archived: false },
      { colourId: 'red', archived: false },
    ],
    variants: [v('v1', 'navy', 's', 99000), v('v2', 'navy', 'm', 99000), v('v3', 'red', 's', null), { ...v('v4', 'red', 'm', 1), archived: true }],
  } as unknown as ProductView;

  it('starts from the saved product: own titles only, sizes in their order, prices in whole units', () => {
    const s = initialState(product, naming, m);
    expect([s.seoTitleEn, s.seoTitleBn, s.colours, s.sizes]).toEqual(['', 'পোলো', ['navy', 'red'], ['s', 'm']]);
    expect(s.prices.v1).toEqual({ price: '990', compareAt: '' });
    expect(s.prices.v4).toBeUndefined();
  });

  it('sends only what changed, clears with null, retires dropped colours, makes new SKUs, keeps prices for those allowed', () => {
    const base = initialState(product, naming, m);
    expect(buildSave(base, base, product, m, true)).toEqual({ input: {}, problems: [], dirty: false });
    const draft = {
      ...base,
      descriptionEn: '  ',
      seoTitleEn: 'Navy polo',
      colours: ['navy', 'teal'],
      prices: { ...base.prices, v2: { price: '1090', compareAt: '1290' } },
      fresh: { 'teal|s': { sku: ' PL1-TL-S ', price: '990', compareAt: '' }, 'teal|m': { sku: '', price: '', compareAt: '' } },
    };
    const b = buildSave(base, draft, product, m, true);
    expect(b.problems).toEqual([]);
    expect(b.input).toEqual({
      product: { descriptionEn: null },
      naming: { seoTitleEn: 'Navy polo' },
      retire: ['v3'],
      variants: [{ id: 'v2', patch: { priceMinor: 109000, compareAtMinor: 129000 } }],
      colours: ['navy', 'teal'],
      create: [{ sku: 'PL1-TL-S', colourId: 'teal', sizeId: 's', priceMinor: 99000 }],
    });
    const noPrices = buildSave(base, draft, product, m, false);
    expect(noPrices.input.variants).toBeUndefined();
    expect(noPrices.input.create).toEqual([{ sku: 'PL1-TL-S', colourId: 'teal', sizeId: 's' }]);
  });

  it('names what cannot be sent: an empty name, a price that is not an amount', () => {
    const base = initialState(product, naming, m);
    const b = buildSave(base, { ...base, nameEn: ' ', prices: { ...base.prices, v1: { price: 'abc', compareAt: '' } } }, product, m, true);
    expect(b.problems).toEqual(['nameEn', 'price:V1']);
    expect(b.input.naming).toBeUndefined();
    expect(b.dirty).toBe(true);
  });
});
