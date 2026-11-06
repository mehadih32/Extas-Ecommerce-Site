// PR 110 follow-up (41) — "Help me pick my size" offers Find My Size on the product (demo 50-bag.js bag_brkCard: the
// "Find my size" button to `?finder=1`) while the finder is on; with the finder off only the keep buttons show.
// Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BagItem, BagView } from '@extas/cart';
import en from '../../../../messages/shop.en.json';
import { t, type Dict } from '@/lib/i18n';
import type { ShopContext } from '@/lib/shop/context';
import { SizesCard } from './SizesCard';

const c = {
  lang: 'en',
  bnDigits: false,
  s: { 'naming.productPathPrefix': 'product' },
  t: (k: string, v?: Record<string, string | number>) => t(en as Dict, k, v),
  num: (n: number) => String(n),
} as unknown as ShopContext;

const group = (answer: 'help' | null) =>
  ({
    key: 'p1||s1+s2',
    productId: 'p1',
    colourId: 'c1',
    sizes: [
      { sizeId: 's1', label: 'M' },
      { sizeId: 's2', label: 'L' },
    ],
    lineIds: ['l1', 'l2'],
    lastLineId: 'l2',
    answer,
    name: { nameEn: 'Test polo', nameBn: null },
  }) as unknown as BagView['groups'][number];

const items = [
  { lineId: 'l1', productId: 'p1', slug: 'test-polo', colour: { key: 'navy' }, size: { id: 's1' } },
  { lineId: 'l2', productId: 'p1', slug: 'test-polo', colour: { key: 'navy' }, size: { id: 's2' } },
] as unknown as BagItem[];

describe('the two-sizes card offers Find My Size (follow-up 41)', () => {
  it('in "help", a Find my size link opens the product with ?finder=1 while the finder is on', () => {
    const html = renderToStaticMarkup(<SizesCard c={c} group={group('help')} items={items} policyLine={null} finderOn />);
    expect(html).toContain('data-testid="brk-finder"');
    expect(html).toContain('href="/product/test-polo?color=navy&amp;finder=1"');
    expect(html).toContain(t(en as Dict, 'bag.sizes.finder'));
  });

  it('with the finder off, or before "help", no finder link', () => {
    expect(renderToStaticMarkup(<SizesCard c={c} group={group('help')} items={items} policyLine={null} finderOn={false} />)).not.toContain('brk-finder');
    expect(renderToStaticMarkup(<SizesCard c={c} group={group(null)} items={items} policyLine={null} finderOn />)).not.toContain('brk-finder');
  });
});
