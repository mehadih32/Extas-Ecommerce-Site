// PR 72 / 73 — the search's pure parts: the query an address asks for, the results page's addresses (words kept with the
// category page's filters), the help pages as search entries (follow-up 73: only pages that say something, found by their
// title and the owner's words), the line under each, and the window's chips and words.
import { matchHelp } from '@extas/search';
import { searchSettings, shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { parseState } from './category-model';
import { shopT } from './dict';
import { HELP_SLUGS, helpModel, type HelpFacts, type HelpModel } from './help-pages';
import { fillQ, helpAnswer, helpEntries, queryFrom, searchChips, searchHref, searchPanelProps, MAX_QUERY } from './search-model';

const helpSet = searchSettings['search.help'].default;
const match = searchSettings['search.match'].default;
const pages = shopMoreSettings['pages.help'].default;
const none: HelpFacts = { whatsapp: null, phone: null, email: null, address: null, hours: null, registeredName: null, tradeLicence: null, dbid: null, waText: 'Hi' };

function models(lang: 'en' | 'bn' = 'en'): Record<(typeof HELP_SLUGS)[number], HelpModel> {
  const rules = {
    delivery: [{ key: 'delivery-fee', short: 'Inside Dhaka 2–3 days, outside 3–5 days', full: 'We deliver everywhere.' }],
    exchange: [{ key: 'exchange', short: 'Exchange within 72 hours for size or fault', full: 'Unworn, with tags.' }],
  } as const;
  return Object.fromEntries(
    HELP_SLUGS.map((slug) => [
      slug,
      helpModel({ slug, set: pages, text: null, lang, t: shopT(lang), rules: (rules as Record<string, readonly { key: string; short: string; full: string }[]>)[slug]?.slice() ?? [], facts: none }),
    ]),
  ) as Record<(typeof HELP_SLUGS)[number], HelpModel>;
}

describe('the query an address asks for', () => {
  it('the first q, spaces tidied, cut to the bound', () => {
    expect(queryFrom({ q: '  navy   polo ' })).toBe('navy polo');
    expect(queryFrom({ q: ['polo', 'shirt'] })).toBe('polo');
    expect(queryFrom({})).toBe('');
    expect(Array.from(queryFrom({ q: 'ক'.repeat(MAX_QUERY + 40) }))).toHaveLength(MAX_QUERY);
  });

  it('the results page keeps the words with the filters and sort, in either language', () => {
    expect(searchHref('en', 'navy polo')).toBe('/search?q=navy+polo');
    expect(searchHref('bn', 'পোলো')).toBe(`/bn/search?q=${encodeURIComponent('পোলো')}`);
    const s = parseState({ size: 'L', sort: 'low', page: '2' }, ['rec', 'low']);
    expect(searchHref('en', 'polo', { s, defaultSort: 'rec' })).toBe('/search?q=polo&size=L&sort=low&page=2');
    expect(searchHref('en', '')).toBe('/search');
  });
});

describe('help pages in search (follow-up 73)', () => {
  it('only pages that say something are entries: a "Coming soon" page is no answer', () => {
    const { entries, items } = helpEntries(models(), [...HELP_SLUGS], helpSet, 'en');
    expect(entries.map((e) => e.id).sort()).toEqual(['delivery', 'exchange']);
    expect(items.get('delivery')).toMatchObject({ title: 'Delivery', href: '/help/delivery', answer: 'Inside Dhaka 2–3 days, outside 3–5 days' });
  });

  it('"delivery", "delivary", "return policy", "ডেলিভারি" find their page; switched off, nothing does', () => {
    const { entries } = helpEntries(models(), [...HELP_SLUGS], helpSet, 'en');
    const ids = (q: string) => matchHelp(q, entries, helpSet.weak, new Set(['polo']), match).hits.map((h) => h.id);
    expect(ids('delivery')).toEqual(['delivery']);
    expect(ids('delivary')).toEqual(['delivery']);
    expect(ids('return policy')).toEqual(['exchange']);
    expect(ids('ডেলিভারি')).toEqual(['delivery']);
    expect(ids('polo')).toEqual([]);
    expect(helpEntries(models(), [...HELP_SLUGS], { ...helpSet, on: false }, 'en').entries).toEqual([]);
  });

  it('a page is found by its own title too (the owner may rename it), in Bengali on a Bengali page', () => {
    const { entries } = helpEntries(models('bn'), [...HELP_SLUGS], { ...helpSet, keywords: {} as typeof helpSet.keywords }, 'bn');
    const title = models('bn').exchange.title;
    expect(matchHelp(title, entries, [], new Set(), match).hits[0]?.id).toBe('exchange');
  });

  it('the line under a page: its first question, its first rule line, its first paragraph, its ways to reach us, its lede', () => {
    const base = { qa: [], sections: [], lede: null, channels: [] } as Pick<HelpModel, 'qa' | 'sections' | 'lede' | 'channels'>;
    expect(helpAnswer({ ...base, qa: [{ id: 'a', q: 'Do you deliver?', a: [] }] })).toBe('Do you deliver?');
    expect(helpAnswer({ ...base, sections: [{ id: 'own', title: null, blocks: [{ kind: 'h', text: 'H' }, { kind: 'p', text: 'First words.' }] }] })).toBe('First words.');
    expect(helpAnswer({ ...base, channels: [{ id: 'phone', icon: 'phone', title: '01700000000', sub: '', href: null, external: false }] })).toBe('01700000000');
    expect(helpAnswer({ ...base, lede: 'We help.' })).toBe('We help.');
    expect(helpAnswer(base)).toBeNull();
  });
});

describe('the search window', () => {
  it('chips: the owner`s popular words (none by default) and the categories that have styles', () => {
    const cats = [
      { slug: 'polos', nameEn: 'Polos', nameBn: 'পোলো', count: 3 },
      { slug: 'empty', nameEn: 'Empty', nameBn: null, count: 0 },
    ];
    expect(searchChips('bn', ['  polo ', ''], cats)).toEqual({
      popular: [{ text: 'polo', href: '/bn/search?q=polo' }],
      categories: [{ text: 'পোলো', href: '/bn/collections/polos' }],
    });
    expect(searchSettings['search.panel'].default.popular).toEqual([]);
  });

  it('its words come from the dictionary with {q} left to fill; WhatsApp only with a number', () => {
    const c = { lang: 'en' as const, bnDigits: true, t: shopT('en'), cats: [], vars: { store: 'Shop' }, s: { 'contact.whatsapp': null }, flags: { whatsapp: false } };
    const p = searchPanelProps(c as unknown as Parameters<typeof searchPanelProps>[0], searchSettings['search.panel'].default);
    expect(p.suggestUrl).toBe('/search/suggest');
    expect(p.resultsUrl).toBe('/search');
    expect(fillQ(p.words.seeAll, { q: 'polo' })).toBe('See all results for “polo”');
    expect(fillQ(p.words.seeAllN, { q: 'polo', n: 4 })).toBe('See all 4 results for “polo”');
    expect(p.wa).toBeNull();
    const withWa = searchPanelProps({ ...c, s: { 'contact.whatsapp': '+8801700000000' }, flags: { whatsapp: true } } as unknown as Parameters<typeof searchPanelProps>[0], searchSettings['search.panel'].default);
    expect(withWa.wa).toEqual({ number: '+8801700000000', message: 'Hi Shop, I am looking for {q}' });
  });
});
