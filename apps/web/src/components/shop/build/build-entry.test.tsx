// Follow-up 242 — the set builder's entries on the home page, a category page and a product page: each says the set
// tier rule's own prices and links to the builder (the category and product ones to that set group's own page); all
// three are off as shipped, so with no settings store nothing is read and nothing is drawn. Made-up test values.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/shop-build.en.json';
import { t, type Dict } from '@/lib/i18n';
import type { ShopContext } from '@/lib/shop/context';
import { buildEntryFor, CategoryBuildBanner, HomeBuildRow, PdpBuildLine } from './BuildEntry';

const c = {
  lang: 'en',
  bnDigits: false,
  storeId: 1,
  t: (k: string, v?: Record<string, string | number>) => t(en as Dict, k, v),
  num: (n: number) => String(n),
  money: (n: number) => `Tk ${n / 100}`,
} as unknown as ShopContext;
const entry = {
  href: '/combos/build-your-own/any-polos',
  tiers: [
    { quantity: 2, priceMinor: 150000 },
    { quantity: 3, priceMinor: 210000 },
  ] as never,
};

describe('the set builder entries (follow-up 242)', () => {
  it('draws the home row, the category banner and the product line with the rule`s own prices and links', () => {
    const home = renderToStaticMarkup(<HomeBuildRow c={c} entry={entry} />);
    expect(home).toContain('data-testid="home-build"');
    expect(home).toContain('Any 2 Tk 1500 · Any 3 Tk 2100');
    // a narrow phone shows the smallest set only (CSS picks one; both are drawn)
    expect(home).toContain('<span class="bs-entry-ps">Any 2 Tk 1500</span>');
    expect(home).toContain('Start building');
    const cat = renderToStaticMarkup(<CategoryBuildBanner c={c} entry={entry} />);
    expect(cat).toContain('href="/combos/build-your-own/any-polos"');
    expect(cat).toContain('data-testid="cat-build"');
    const pdp = renderToStaticMarkup(<PdpBuildLine c={c} entry={entry} />);
    expect(pdp).toContain('<b>Build your own set</b> · Any 2 Tk 1500 · Any 3 Tk 2100');
  });

  it('draws nothing without an entry, and finds none while its place is off (as shipped)', async () => {
    expect(renderToStaticMarkup(<HomeBuildRow c={c} entry={null} />)).toBe('');
    expect(renderToStaticMarkup(<CategoryBuildBanner c={c} entry={null} />)).toBe('');
    expect(renderToStaticMarkup(<PdpBuildLine c={c} entry={null} />)).toBe('');
    expect(await buildEntryFor(c, 'home')).toBeNull();
    expect(await buildEntryFor(c, 'product', ['p'])).toBeNull();
  });
});
