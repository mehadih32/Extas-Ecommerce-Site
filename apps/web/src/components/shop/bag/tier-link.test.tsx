// PR 98 follow-up (244) — the bag's tier box "Take 2 │ Take 3" leads to its rule's own builder page while the builder is
// open (`/combos/build-your-own/<rule key>`), else to the category as before. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BagView } from '@extas/cart';
import { ladderOf } from '@extas/cart/pure';
import en from '../../../../messages/shop.en.json';
import { t, type Dict } from '@/lib/i18n';
import type { ShopContext } from '@/lib/shop/context';
import { Ladder, PhoneTier } from './OfferSlot';

const c = {
  lang: 'en',
  bnDigits: false,
  s: { 'naming.productPathPrefix': 'product' },
  t: (k: string, v?: Record<string, string | number>) => t(en as Dict, k, v),
  num: (n: number) => String(n),
  money: (n: number) => `Tk ${n / 100}`,
} as unknown as ShopContext;

const tiers = {
  ruleKey: 'polo-sets',
  nameEn: 'Polo sets',
  nameBn: null,
  category: { slug: 'polos', nameEn: 'Polos', nameBn: null },
  ladder: ladderOf({ tiers: [{ quantity: 2, priceMinor: 150000 }], unitPriceMinor: 90000, inBag: 1, max: 3 })!,
  inBag: 1,
  words: {},
} as unknown as NonNullable<BagView['tiers']>;

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe('the tier box link (follow-up 244)', () => {
  it("leads to the rule's builder page while the builder is open", () => {
    expect(hrefs(renderToStaticMarkup(<Ladder c={c} tiers={tiers} phone={false} builderHref="/combos/build-your-own/polo-sets" />))).toEqual(['/combos/build-your-own/polo-sets']);
    expect(hrefs(renderToStaticMarkup(<PhoneTier c={c} tiers={tiers} builderHref="/combos/build-your-own/polo-sets" />))).toEqual(['/combos/build-your-own/polo-sets']);
  });
  it('keeps the category link while the builder is closed', () => {
    expect(hrefs(renderToStaticMarkup(<Ladder c={c} tiers={tiers} phone={false} />))).toEqual(['/collections/polos']);
    expect(hrefs(renderToStaticMarkup(<PhoneTier c={c} tiers={tiers} />))).toEqual(['/collections/polos']);
  });
});
