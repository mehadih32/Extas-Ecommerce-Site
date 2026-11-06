// S12 · PR 592 follow-up — the journal's search words and ranking, the tags typed, and the RSS file, without the database.
import { describe, expect, it } from 'vitest';
import { matchScore, rankMatches, rssXml, searchWords } from './browse-model';
import { RESERVED_SLUGS, slugOf, tagList, tagSlug } from './model';

const post = (over: Partial<Parameters<typeof matchScore>[0]> & { publishedAt?: string | null } = {}) => ({
  title: 'How to wash a polo',
  excerpt: 'Cold water, shade.',
  quickAnswer: null,
  body: 'Wash darks with darks.',
  focusKeyword: null,
  tags: [{ name: 'polo' }],
  category: { nameEn: 'Care', nameBn: 'যত্ন' },
  publishedAt: '2026-11-01T00:00:00Z',
  ...over,
});

describe('search words', () => {
  it('folds case and signs, drops one-letter words, keeps Bengali, at most six words', () => {
    expect(searchWords('  Polo, WASH!  a ')).toEqual(['polo', 'wash']);
    expect(searchWords('পোলো ধোয়া')).toEqual(['পোলো', 'ধোয়া']);
    expect(searchWords('a')).toEqual([]);
    expect(searchWords(null)).toEqual([]);
    expect(searchWords('one two three four five six seven')).toHaveLength(6);
    expect(searchWords('polo polo')).toEqual(['polo']);
  });
});

describe('ranking', () => {
  it('counts the title most, then tags / keyword / topic, the summary, the text', () => {
    expect(matchScore(post(), ['wash'])).toBe(5 + 1);
    expect(matchScore(post(), ['polo'])).toBe(5 + 3);
    expect(matchScore(post(), ['care'])).toBe(3);
    expect(matchScore(post(), ['যত্ন'])).toBe(3);
    expect(matchScore(post(), ['shade'])).toBe(2);
    expect(matchScore(post(), ['linen'])).toBe(0);
  });
  it('best first, the newest first among equals, nothing without words', () => {
    const a = post({ title: 'Linen notes', body: 'polo', publishedAt: '2026-11-03T00:00:00Z', tags: [] });
    const b = post({ title: 'Polo care', publishedAt: '2026-11-01T00:00:00Z' });
    const c = post({ title: 'Polo fit', publishedAt: '2026-11-02T00:00:00Z' });
    expect(rankMatches([a, b, c], ['polo']).map((x) => x.title)).toEqual(['Polo fit', 'Polo care', 'Linen notes']);
    expect(rankMatches([a, b], [])).toEqual([]);
    expect(rankMatches([a], ['denim'])).toEqual([]);
  });
});

describe('tags', () => {
  it('keeps each tag once by its link, without "#", split at commas', () => {
    expect(tagList('Polo, #washing , polo,, ধোয়া')).toEqual([
      { name: 'Polo', slug: 'polo' },
      { name: 'washing', slug: 'washing' },
      { name: 'ধোয়া', slug: tagSlug('ধোয়া') },
    ]);
    expect(tagList(['  ', '#'])).toEqual([]);
  });
  it('a Bengali tag gets a stable Latin link; a Latin one its own words', () => {
    expect(tagSlug('ধোয়া')).toMatch(/^t-[0-9a-f]{8}$/);
    expect(tagSlug('ধোয়া')).toBe(tagSlug('ধোয়া'));
    expect(tagSlug('ধোয়া')).not.toBe(tagSlug('যত্ন'));
    expect(tagSlug('Dhaka Weather')).toBe('dhaka-weather');
  });
  it("an article's link never takes a journal page's own address", () => {
    for (const s of RESERVED_SLUGS) expect(slugOf({ slug: s, title: 'x' })).toBeNull();
    expect(slugOf({ slug: '', title: 'Search' })).toBeNull();
    expect(slugOf({ slug: 'searching', title: 'x' })).toBe('searching');
  });
});

describe('RSS', () => {
  it('writes an RSS 2.0 channel with its own address and each article escaped', () => {
    const xml = rssXml({ title: 'Sample & Co', link: 'https://shop.example/journal', self: 'https://shop.example/journal/rss.xml', description: 'Sample & Co', lang: 'bn' }, [
      { title: 'Polo <care>', link: 'https://shop.example/bn/journal/polo', description: null, published: '2026-11-01T06:00:00.000Z', category: 'যত্ন', author: 'Sample Ana' },
    ]);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Sample &amp; Co</title>');
    expect(xml).toContain('<atom:link href="https://shop.example/journal/rss.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain('<language>bn-BD</language>');
    expect(xml).toContain('<item><title>Polo &lt;care&gt;</title><link>https://shop.example/bn/journal/polo</link><guid isPermaLink="true">https://shop.example/bn/journal/polo</guid>');
    expect(xml).toContain('<pubDate>Sun, 01 Nov 2026 06:00:00 GMT</pubDate>');
    expect(xml).not.toContain('<description></description>');
    expect(rssXml({ title: 'x', link: 'https://s.example/', self: 'https://s.example/r', description: 'x', lang: 'en' }, [])).not.toContain('<item>');
  });
});
