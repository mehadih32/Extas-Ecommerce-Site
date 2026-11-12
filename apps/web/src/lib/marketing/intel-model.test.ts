// S13 · PR 548 — the market-and-competitor pure model: reading a followed shop's own JSON-LD facts, matching our
// products to theirs by name (Jaccard overlap), and the diff since the last read. No network, no database.
import { describe, expect, it } from 'vitest';
import { diffFacts, jaccard, matchProducts, parseCompetitorPage, publicUrl, tokens, type CompetitorPageFacts } from './intel-model';

const PAGE = `<!doctype html><html><head><title>Sample Shop — menswear</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Product', name: 'Solid Navy Polo', offers: { price: '720.00', priceCurrency: 'BDT' } },
    { '@type': 'Product', name: 'Oxford Shirt', offers: { price: '950', priceCurrency: 'BDT' } },
    { '@type': 'Product', name: 'Oxford Shirt' }, // a duplicate name, no price — skipped
  ],
})}</script>
</head><body><h2>New arrivals</h2><h3>Polo shirts</h3><h3>New arrivals</h3></body></html>`;

describe('parseCompetitorPage (PR 548)', () => {
  it('reads the title, the deduplicated h2/h3 outline, and every named Product with a readable price', () => {
    const f = parseCompetitorPage(PAGE, 'https://shop.example/');
    expect(f.title).toBe('Sample Shop — menswear');
    expect(f.headings).toEqual(['New arrivals', 'Polo shirts']);
    expect(f.products).toEqual([
      { name: 'Solid Navy Polo', priceAmount: '720.00', currency: 'BDT' },
      { name: 'Oxford Shirt', priceAmount: '950', currency: 'BDT' },
    ]);
  });

  it('a page with no JSON-LD product still gives its title and headings', () => {
    const f = parseCompetitorPage('<title>Plain page</title><h2>Hello</h2>', 'https://shop.example/x');
    expect(f.title).toBe('Plain page');
    expect(f.products).toEqual([]);
  });

  it('broken JSON-LD is skipped, never thrown', () => {
    expect(() => parseCompetitorPage('<script type="application/ld+json">{not json</script>', 'https://x.test')).not.toThrow();
  });
});

describe('publicUrl (PR 548)', () => {
  it('accepts a plain http(s) address and strips its hash', () => {
    expect(publicUrl('https://shop.example/sale#top')?.toString()).toBe('https://shop.example/sale');
  });
  it('refuses a non-http(s) scheme, a user:pass address, or unreadable text', () => {
    expect(publicUrl('ftp://shop.example')).toBeNull();
    expect(publicUrl('https://user:pass@shop.example')).toBeNull();
    expect(publicUrl('not a url')).toBeNull();
  });
});

describe('tokens/jaccard (PR 548)', () => {
  it('overlaps on shared words, ignoring case and stop words', () => {
    expect(jaccard(tokens('Solid Navy Polo'), tokens('navy polo, solid'))).toBe(1);
    expect(jaccard(tokens('Oxford Shirt'), tokens('Solid Navy Polo'))).toBe(0);
  });
  it('an empty side never matches', () => {
    expect(jaccard(tokens(''), tokens('polo'))).toBe(0);
  });
});

describe('matchProducts (PR 548)', () => {
  const ours = [
    { id: 'p1', name: 'Solid Navy Polo', priceMinor: 80_000 },
    { id: 'p2', name: 'Classic Chino', priceMinor: 120_000 },
  ];
  const theirs = [
    { name: 'Navy Solid Polo Shirt', priceAmount: '720.00', currency: 'BDT' },
    { name: 'Something unrelated', priceAmount: null, currency: null },
  ];

  it('matches by name overlap and gives the price gap in the same currency', () => {
    const m = matchProducts(ours, theirs, 0.3, 'BDT', 2);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ ourId: 'p1', theirName: 'Navy Solid Polo Shirt', theirPriceMinor: 72_000, gapMinor: -8_000 });
  });
  it('below minScore, or a different currency, leaves the product out of the table', () => {
    expect(matchProducts(ours, theirs, 0.9, 'BDT', 2)).toEqual([]);
    const diffCcy = matchProducts(ours, [{ name: 'Solid Navy Polo', priceAmount: '10', currency: 'USD' }], 0.3, 'BDT', 2);
    expect(diffCcy[0]!.theirPriceMinor).toBeNull();
    expect(diffCcy[0]!.gapMinor).toBeNull();
  });
});

describe('diffFacts (PR 548)', () => {
  const prev: CompetitorPageFacts = { title: 't', headings: [], products: [{ name: 'Polo', priceAmount: '700', currency: 'BDT' }] };

  it('the very first read is "first", with no changes to list', () => {
    expect(diffFacts(null, prev, 2)).toEqual({ kind: 'first', priceChanges: [], newProducts: [] });
  });
  it('a lower price on a known product is "lower", with the from/to amounts', () => {
    const cur: CompetitorPageFacts = { title: 't', headings: [], products: [{ name: 'Polo', priceAmount: '650', currency: 'BDT' }] };
    expect(diffFacts(prev, cur, 2)).toEqual({ kind: 'lower', priceChanges: [{ name: 'Polo', fromMinor: 70_000, toMinor: 65_000 }], newProducts: [] });
  });
  it('a new product with no price change is "newProducts"', () => {
    const cur: CompetitorPageFacts = { title: 't', headings: [], products: [{ name: 'Polo', priceAmount: '700', currency: 'BDT' }, { name: 'New Tee', priceAmount: '500', currency: 'BDT' }] };
    expect(diffFacts(prev, cur, 2).kind).toBe('newProducts');
    expect(diffFacts(prev, cur, 2).newProducts).toEqual(['New Tee']);
  });
  it('nothing readable changed is "none"', () => {
    expect(diffFacts(prev, prev, 2).kind).toBe('none');
  });
});
