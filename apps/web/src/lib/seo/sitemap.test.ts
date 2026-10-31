// S11 · PR 228 — the sitemap files: split by kind and by size (a Bengali twin counts), absolute addresses on the
// shop's domain, the hreflang pair only for a ready twin, escaped, and an index that names every file.
import { describe, expect, it } from 'vitest';
import { capSet, filesOf, filesOfSet, indexXml, parseSitemapFile, sitemapFileName, urlsetXml, xmlEscape, type SitemapEntry } from './sitemap';

const origin = new URL('https://shop.example.test');
const e = (path: string, bn = false, lastmod: Date | null = null): SitemapEntry => ({ path, bn, lastmod });

describe('sitemaps (PR 228)', () => {
  it('names and reads the files of each kind', () => {
    expect(sitemapFileName('products', 2)).toBe('products-2.xml');
    expect(parseSitemapFile('products-2.xml')).toEqual({ kind: 'products', n: 2 });
    expect(parseSitemapFile('collections-1.xml')).toEqual({ kind: 'collections', n: 1 });
    for (const bad of ['products-0.xml', 'products.xml', 'orders-1.xml', 'products-1.xml.gz', '../products-1.xml', 'products-01.xml']) expect(parseSitemapFile(bad), bad).toBeNull();
  });

  it('splits a kind by size, a Bengali twin counting as an address; an empty kind keeps one empty file', () => {
    expect(filesOf([], 3)).toEqual([[]]);
    const list = [e('/a'), e('/b', true), e('/c'), e('/d')];
    expect(filesOf(list, 3).map((f) => f.map((x) => x.path))).toEqual([['/a', '/b'], ['/c', '/d']]);
    expect(filesOf(list, 1).map((f) => f.length)).toEqual([1, 1, 1, 1]);
  });

  it('PR 236: writes both twins of a ready page but no language pair (the HTML head names it), as shipped', () => {
    const xml = urlsetXml(origin, [e('/', true), e('/a')], 'en');
    expect(xml.match(/<loc>[^<]*<\/loc>/g)).toEqual(['<loc>https://shop.example.test/</loc>', '<loc>https://shop.example.test/bn</loc>', '<loc>https://shop.example.test/a</loc>']);
    expect(xml).not.toContain('xhtml');
    expect(xml).not.toContain('hreflang');
  });

  it('writes absolute addresses, the twins only when ready, x-default as the owner keeps it, escaped (pairs switched on)', () => {
    const xml = urlsetXml(origin, [e('/collections/polos?colour=navy&x=1', false, new Date('2026-10-30T22:00:00Z')), e('/', true)], 'en', true);
    expect(xml).toContain('<loc>https://shop.example.test/collections/polos?colour=navy&amp;x=1</loc><lastmod>2026-10-30</lastmod></url>');
    expect(xml).toContain('<url><loc>https://shop.example.test/</loc><xhtml:link rel="alternate" hreflang="en" href="https://shop.example.test/"/>');
    expect(xml).toContain('<url><loc>https://shop.example.test/bn</loc>');
    expect(xml).toContain('hreflang="x-default" href="https://shop.example.test/"');
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain('xmlns:xhtml=');
    expect(urlsetXml(origin, [e('/', true)], 'none', true)).not.toContain('x-default');
    expect(urlsetXml(origin, [], 'en')).toContain('<urlset');
    expect(xmlEscape(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;');
  });

  it('the index names every file of every kind with its latest change', () => {
    const files = filesOfSet({ pages: [e('/')], collections: [], products: [e('/p/a', false, new Date('2026-10-01')), e('/p/b', false, new Date('2026-10-20'))], combos: [] }, 1);
    expect(files.map((f) => f.name)).toEqual(['pages-1.xml', 'collections-1.xml', 'products-1.xml', 'products-2.xml', 'combos-1.xml']);
    const xml = indexXml(origin, files);
    expect(xml).toContain('<sitemap><loc>https://shop.example.test/sitemaps/products-2.xml</loc><lastmod>2026-10-20</lastmod></sitemap>');
    expect(xml).toContain('<sitemap><loc>https://shop.example.test/sitemaps/collections-1.xml</loc></sitemap>');
  });

  it('never holds more than the cap in all, kinds in order, a page never without its twin', () => {
    const set = { pages: [e('/'), e('/help/faq', true)], collections: [e('/collections/a')], products: [e('/p/a')], combos: [] };
    const two = capSet(set, 2);
    expect(two.pages.map((x) => x.path)).toEqual(['/']);
    expect(two.collections).toEqual([]);
    expect(capSet(set, 4).collections.map((x) => x.path)).toEqual(['/collections/a']);
    expect(capSet(set, 4).products).toEqual([]);
    expect(Object.values(capSet(set, 100)).flat()).toHaveLength(4);
  });
});
