// S02 · PR 79 — which shop words a page shows: exact words, words with {slots} filled by the shop, words split by "|"
// over two lines, the owner's word instead of the shop's, the page's language only; bare slots and one-letter words
// never match.
import { describe, expect, it } from 'vitest';
import { defaultWord } from './words';
import { matchWords, normText } from './words-match';

const keys = (w: { key: string }[]) => w.map((x) => x.key);

describe('words on a shop page (PR 79)', () => {
  it('finds exact words and filled {slots}, in the page language, with the texts they showed as', () => {
    const words = matchWords(null, 'en', ['  New   in ', 'Bag, 3 items', 'Something else', '{store}']);
    expect(keys(words)).toEqual(expect.arrayContaining(['nav.newIn', 'header.bagItems']));
    expect(words.find((w) => w.key === 'header.bagItems')?.seen).toEqual(['Bag, 3 items']);
    expect(keys(words)).not.toContain('meta.title');
    expect(keys(matchWords(null, 'bn', ['New in']))).not.toContain('nav.newIn');
    expect(keys(matchWords(null, 'bn', [defaultWord('bn', 'nav.newIn')]))).toContain('nav.newIn');
  });

  it('a word split over two lines is found by each piece', () => {
    expect(keys(matchWords(null, 'en', ['Delivery']))).toContain('footer.promise.cod');
    expect(keys(matchWords(null, 'en', ['in 48 hours']))).toContain('footer.promise.exchange');
  });

  it("the owner's word is what the page shows", () => {
    const labels = { 'nav.newIn': { en: 'Sample arrivals' } };
    expect(keys(matchWords(labels, 'en', ['Sample arrivals']))).toContain('nav.newIn');
    expect(keys(matchWords(labels, 'en', ['New in']))).not.toContain('nav.newIn');
    expect(matchWords(labels, 'en', ['Sample arrivals']).find((w) => w.key === 'nav.newIn')).toMatchObject({ own: { en: 'Sample arrivals' }, changed: true });
  });

  it('normalises spaces', () => {
    expect(normText('  a \n b  ')).toBe('a b');
  });
});
