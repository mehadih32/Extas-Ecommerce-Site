// S28 · PR 684 — the demo products' shop side: the "coming soon" words answer without a database, in both languages; the
// setting ships off with words of its own; a demo page is never indexed (checked by the product page's source).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registry, catalogueDemoSchema } from '@extas/settings';
import { GET } from '../../app/api/shop/demo-popup/route';

describe('catalogue.demo', () => {
  it('ships off, hiding by itself at 5 real products, with pop-up words in both languages', () => {
    const d = registry['catalogue.demo'].default;
    expect(d).toMatchObject({ on: false, off: [], auto: true, autoN: 5 });
    expect(catalogueDemoSchema.safeParse(d).success).toBe(true);
    expect(d.popupEn.length).toBeGreaterThan(5);
    expect(d.popupBn.length).toBeGreaterThan(5);
    expect(catalogueDemoSchema.safeParse({ ...d, autoN: 0 }).success).toBe(false);
  });
});

describe('/api/shop/demo-popup', () => {
  it('answers with the shop dictionary words when there is no database', async () => {
    const en = await (await GET(new Request('http://shop.test/api/shop/demo-popup?lang=en'))).json();
    const bn = await (await GET(new Request('http://shop.test/api/shop/demo-popup?lang=bn'))).json();
    expect(en).toMatchObject({ ok: true, text: 'This product is coming soon.', close: 'Close' });
    expect(bn.ok).toBe(true);
    expect(bn.text).toContain('শিগগিরই');
  });
});

describe('where demo products are left out', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('the Google, feed and sitemap queries ask for isDemo false', () => {
    for (const f of ['../marketing/merchant-feed.ts', '../seo/sitemap-data.ts', '../seo/video-sitemap.ts', '../seo/health.ts']) expect(src(f), f).toContain('isDemo: false');
  });
  it('a demo product page is not indexed, and the bag refuses it', () => {
    expect(src('../../components/shop/product/ProductPage.tsx')).toContain('isDemoProductOnce');
    expect(readFileSync(new URL('../../../../../packages/cart/src/cart.ts', import.meta.url), 'utf8')).toContain("'DEMO_PRODUCT'");
  });
});
