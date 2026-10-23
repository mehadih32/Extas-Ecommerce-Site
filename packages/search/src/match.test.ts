// PR 72 — the matcher and the help matcher without a database: the demo's search complaints (Blueprint D3.2, §58.11:
// "polo shirt" and "গেঞ্জি" found nothing; "delivery" and "return policy" found nothing), typos, prefixes, Bengali,
// general words, "did you mean" and "what some of the words find".
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { matchHelp, restAfterHelp } from './help';
import { didYouMean, isGeneral, matchDocs, partialMatch, queryWords, vocabulary, wordLists, type SearchDoc } from './match';
import { fingerprint, norm, slips, words } from './text';

const m = registry['search.match'].default;
const lists = wordLists(registry['search.words'].default);

const doc = (id: string, name: string, more = '', rank = 0, kind: SearchDoc['kind'] = 'product'): SearchDoc => {
  const n = words(name);
  return { id, kind, name: n, more: words(more).filter((w) => !n.includes(w)), rank };
};

const docs: SearchDoc[] = [
  doc('polo-navy', 'Classic Pique Polo', 'Polo shirts পোলো শার্ট Navy নেভি White', 5),
  doc('polo-stripe', 'Striped Rib Polo', 'Polo shirts পোলো শার্ট Maroon', 3),
  doc('tee-basic', 'Everyday Crew T-Shirt', 'T-shirts টি-শার্ট Black', 4),
  doc('panjabi', 'Cotton Panjabi', 'Panjabi পাঞ্জাবি Off white', 2),
  doc('hoodie', 'Fleece Hoodie', 'Hoodies Grey', 1),
  doc('chino', 'Slim Chino', 'Trousers Khaki', 1),
  doc('oxford', 'Oxford Shirt', 'Shirts Blue', 1),
];
const ids = (q: string) => matchDocs(docs, q, lists, m).hits.map((h) => h.id);

describe('reading words', () => {
  it('lower case, hyphens join, marks are spaces, Bengali digits are digits, the two ways of typing ড় are one', () => {
    expect(norm('  T-Shirt, POLO!! ')).toBe('tshirt polo');
    expect(norm("Don't")).toBe('dont');
    expect(norm('সাইজ ৪২')).toBe('সাইজ 42');
    expect(norm('ড়')).toBe(norm('ড়'));
    expect(norm('ক‌খ')).toBe('কখ');
    expect(words('')).toEqual([]);
  });

  it('slips: insert, delete, change, swapped neighbours count one; stops past the cap', () => {
    expect(slips('polo', 'polo', 1)).toBe(0);
    expect(slips('pollo', 'polo', 1)).toBe(1);
    expect(slips('hoddie', 'hoodie', 1)).toBe(1);
    expect(slips('exchnage', 'exchange', 2)).toBe(1);
    expect(slips('abc', 'xyzw', 1)).toBe(2);
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });
});

describe('product search (PostgreSQL matcher, demo srch_run)', () => {
  it('a word, the start of a word, a word inside a longer one (5+ letters); the name first, then the owner order', () => {
    expect(ids('polo')).toEqual(['polo-navy', 'polo-stripe']);
    expect(ids('pol')).toEqual(['polo-navy', 'polo-stripe']);
    expect(ids('navy polo')).toEqual(['polo-navy']);
    // "shirt" is inside "tshirt": t-shirts are shirts too (demo); the Oxford's own name word ranks first
    expect(ids('shirt')[0]).toBe('oxford');
  });

  it('phrases are one word: "polo shirt" finds the polos, "t shirt" the t-shirt (§58.11)', () => {
    expect(queryWords('polo shirt', lists)).toEqual(['polo']);
    expect(ids('polo shirt')).toEqual(['polo-navy', 'polo-stripe']);
    expect(ids('t shirt')).toEqual(['tee-basic']);
  });

  it('typos are forgiven only when nothing matches as typed', () => {
    expect(ids('pollo')).toEqual(['polo-navy', 'polo-stripe']);
    expect(ids('panjbi')).toEqual(['panjabi']);
    expect(ids('hoddie')).toEqual(['hoodie']);
    // a real word is never stretched: "pol" is a prefix, not a slip of something else
    expect(ids('xyz')).toEqual([]);
  });

  it('Bengali and Banglish: গেঞ্জি finds t-shirts, পাঞ্জাবি the panjabi, punjabi too; plural to singular', () => {
    expect(ids('গেঞ্জি')).toEqual(['tee-basic']);
    expect(ids('পাঞ্জাবি')).toEqual(['panjabi']);
    expect(ids('punjabi')).toEqual(['panjabi']);
    expect(ids('pant')).toEqual(['chino']);
    expect(ids('chinos')).toEqual(['chino']);
    expect(ids('পোলো')).toEqual(['polo-navy', 'polo-stripe']);
  });

  it('general words are dropped only when needed, and the answer says which', () => {
    const r = matchDocs(docs, 'hoodie for men price', lists, m);
    expect(r.hits.map((h) => h.id)).toEqual(['hoodie']);
    expect(r.dropped).toEqual(['for', 'men', 'price']);
    expect(isGeneral('shrt', lists, m)).toBe(true); // a slip of "shirt" (demo D-015)
    expect(isGeneral('clothes', lists, m)).toBe(true);
    expect(matchDocs(docs, 'for men', lists, m).hits).toEqual([]);
  });

  it('an empty query finds nothing', () => {
    expect(matchDocs(docs, '   ', lists, m)).toEqual({ hits: [], used: [], dropped: [] });
  });

  it('the start of a word only when prefix matching is on', () => {
    expect(matchDocs(docs, 'pol', lists, { ...m, prefix: false }).hits).toEqual([]);
  });

  it('did you mean: the nearest known word, one more slip than search allows', () => {
    const v = vocabulary(docs);
    expect(didYouMean('hoodiiee', v, lists, m)).toBe('hoodie');
    expect(didYouMean('oxfrdd', v, lists, m)).toBe('oxford');
    expect(didYouMean('polo', v, lists, m)).toBeNull();
    expect(didYouMean('qqqqqqq', v, lists, m)).toBeNull();
  });

  it('what some of the words find: the words that find something, the products found by most of them first', () => {
    const p = partialMatch(docs, 'navy hoodie', lists, m);
    expect(p.words).toEqual(['navy', 'hoodie']);
    expect(p.hits.map((h) => h.id).sort()).toEqual(['hoodie', 'polo-navy']);
    expect(partialMatch(docs, 'polo', lists, m).hits).toEqual([]);
  });
});

describe('help pages in search (follow-up 73, demo helpMatch)', () => {
  const kw = registry['search.help'].default;
  const entries = Object.entries(kw.keywords).map(([id, k]) => ({ id, keywords: k }));
  const help = (q: string) => matchHelp(q, entries, kw.weak, vocabulary(docs), m);

  it('help words find their page: delivery, return policy, exchange, COD, Bengali', () => {
    expect(help('delivery').hits[0]!.id).toBe('delivery');
    expect(help('return policy').hits[0]!.id).toBe('exchange');
    expect(help('exchange').hits[0]!.id).toBe('exchange');
    expect(help('cod').hits[0]!.id).toBe('delivery');
    expect(help('ডেলিভারি চার্জ').hits[0]!.id).toBe('delivery');
    expect(help('এক্সচেঞ্জ').hits[0]!.id).toBe('exchange');
    expect(help('privacy').hits[0]!.id).toBe('privacy');
  });

  it('small slips are forgiven, a product word is never "corrected" into a help word', () => {
    expect(help('delivary').hits[0]!.id).toBe('delivery');
    expect(help('exchnge').hits[0]!.id).toBe('exchange');
    expect(help('polo').hits).toEqual([]);
  });

  it('a weak word alone still finds pages; a stronger word wins', () => {
    expect(help('policy').hits.length).toBeGreaterThan(0);
    expect(help('privacy policy').hits[0]!.id).toBe('privacy');
  });

  it('the words a page used are taken out for the product search ("polo delivery" → "polo")', () => {
    const h = help('polo delivery');
    expect(h.hits[0]!.id).toBe('delivery');
    expect(restAfterHelp(h)).toBe('polo');
    expect(help('').hits).toEqual([]);
  });
});
