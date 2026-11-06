// S02 · PR 78 — the pure part of Website › Words & language: every dictionary word is listed (also the `_` keys), the
// search, place and filters, paging, a change applied (empty or the shop's own text = back to the shop's word, an unknown
// key, a too long word and a {slot} the shop's word lacks refused, other owner words untouched), and the CSV round trip.
import { parseCsv, uncell, writeCsv } from '@extas/catalogue';
import { describe, expect, it } from 'vitest';
import { keysOf, SHOP_DICTS, shopT } from '../shop/dict';
import { applyWords, defaultWord, patchFromCsv, untranslated, WORD_CSV_HEADER, WORD_GROUPS, WORD_KEYS, wordCsvRows, wordList } from './words';

const KEY = 'checkout.title';
const SLOT = keysOf(SHOP_DICTS.en).find((k) => /\{\w+\}/.test(defaultWord('en', k)))!;

describe('Words & language (PR 78)', () => {
  it('lists every word of the shop dictionary, also keys with "_", each place once', () => {
    expect(WORD_KEYS).toEqual(keysOf(SHOP_DICTS.en));
    expect(WORD_KEYS).toContain('account.status.ON_HOLD');
    expect(new Set(WORD_GROUPS).size).toBe(WORD_GROUPS.length);
    expect(WORD_GROUPS).toEqual(expect.arrayContaining(['checkout', 'pdp', 'bag', 'account']));
  });

  it('every place has a name in both admin languages', async () => {
    const en = (await import('../../../messages/admin-words.en.json')).default.wd.grp as Record<string, string>;
    const bn = (await import('../../../messages/admin-words.bn.json')).default.wd.grp as Record<string, string>;
    for (const g of WORD_GROUPS) {
      expect(en[g], g).toBeTruthy();
      expect(bn[g], g).toBeTruthy();
    }
  });

  it('searches the key and both languages, filters by place, changed and Bengali still in English, and pages', () => {
    const labels = { [KEY]: { bn: 'নমুনা চেকআউট' } };
    const all = wordList(labels, {}, 40);
    expect(all.total).toBe(WORD_KEYS.length);
    expect(all.rows).toHaveLength(40);
    expect(all.pages).toBe(Math.ceil(WORD_KEYS.length / 40));
    expect(all.changed).toBe(1);
    expect(wordList(labels, { q: 'নমুনা চেকআউট' }, 40).rows.map((r) => r.key)).toEqual([KEY]);
    expect(wordList(labels, { q: KEY.toUpperCase() }, 40).rows.map((r) => r.key)).toContain(KEY);
    const changed = wordList(labels, { show: 'changed' }, 40);
    expect(changed.rows).toMatchObject([{ key: KEY, own: { en: '', bn: 'নমুনা চেকআউট' }, changed: true }]);
    const pdp = wordList(null, { group: 'pdp' }, 40);
    expect(pdp.rows.every((r) => r.group === 'pdp')).toBe(true);
    expect(wordList(null, { group: 'nowhere' }, 40).total).toBe(WORD_KEYS.length);
    const last = wordList(null, { p: 9999 }, 40);
    expect(last.p).toBe(last.pages);
    expect(wordList(null, { p: -3 }, 40).p).toBe(1);
    const un = wordList(null, { show: 'untranslated' }, 5000);
    expect(un.rows.every((r) => r.untranslated)).toBe(true);
    expect(un.total).toBe(un.untranslated);
  });

  it('Bengali still in English: the same text with Latin letters outside {slots}', () => {
    expect(untranslated('Sample', 'Sample')).toBe(true);
    expect(untranslated('{name} · {size}', '{name} · {size}')).toBe(false);
    expect(untranslated('Sample', 'নমুনা')).toBe(false);
  });

  it('applies a change: own word set, the shop\'s text or empty = back, other owner words untouched', () => {
    const before = { 'account.invoice.title': { en: 'Sample invoice' }, [KEY]: { en: 'Old sample' } };
    const r = applyWords(before, { [KEY]: { en: 'Sample pay', bn: 'নমুনা' } });
    expect(r).toMatchObject({ bad: [], changed: [KEY] });
    expect(r.next).toEqual({ 'account.invoice.title': { en: 'Sample invoice' }, [KEY]: { en: 'Sample pay', bn: 'নমুনা' } });
    const back = applyWords(r.next, { [KEY]: { en: '', bn: defaultWord('bn', KEY) } });
    expect(back.next).toEqual({ 'account.invoice.title': { en: 'Sample invoice' } });
    expect(back.changed).toEqual([KEY]);
    // one language only: the other stays
    expect(applyWords(r.next, { [KEY]: { bn: '' } }).next?.[KEY]).toEqual({ en: 'Sample pay' });
    // nothing changed
    expect(applyWords(r.next, { [KEY]: { en: 'Sample pay' } }).changed).toEqual([]);
    expect(applyWords({ [KEY]: { en: 'x' } }, { [KEY]: { en: '' } }).next).toBeNull();
  });

  it('refuses an unknown key, a too long word and a {slot} the shop\'s word does not have', () => {
    expect(applyWords(null, { 'nowhere.word': { en: 'x' } }).bad).toEqual(['nowhere.word']);
    expect(applyWords(null, { [KEY]: { en: 'x'.repeat(301) } }).bad).toEqual([`${KEY}.en`]);
    expect(applyWords(null, { [KEY]: { bn: 'নমুনা {secret}' } }).bad).toEqual([`${KEY}.bn`]);
    const own = defaultWord('en', SLOT);
    expect(applyWords(null, { [SLOT]: { en: `Sample ${own}` } }).bad).toEqual([]);
  });

  it('the CSV export reads back as no change; an edited file changes only its words', () => {
    const labels = { [KEY]: { en: '=Sample formula-looking word' } };
    const file = writeCsv(WORD_CSV_HEADER, wordCsvRows(labels), ',');
    const back = patchFromCsv(parseCsv(file, ','), uncell);
    expect(back.bad).toEqual([]);
    expect(back.missing).toEqual([]);
    expect(applyWords(labels, back.patch).changed).toEqual([]);
    const edited = patchFromCsv(parseCsv(`key,bengali\r\n${KEY},নমুনা\r\n,\r\n`, ','), uncell);
    expect(edited.patch).toEqual({ [KEY]: { bn: 'নমুনা' } });
    expect(applyWords(labels, edited.patch).next?.[KEY]).toEqual({ en: '=Sample formula-looking word', bn: 'নমুনা' });
    expect(patchFromCsv(parseCsv(`key,english\r\nnowhere.word,x\r\n${KEY},a\r\n${KEY},b\r\n`, ','), uncell).bad).toEqual([2, 4]);
    expect(patchFromCsv(parseCsv('word,text\r\n', ','), uncell).missing).toEqual(['key', 'english']);
  });

  it('the shop shows the owner\'s word over its own, in each language', () => {
    expect(shopT('bn', { [KEY]: { bn: 'নমুনা' } })(KEY)).toBe('নমুনা');
    expect(shopT('en', { [KEY]: { bn: 'নমুনা' } })(KEY)).toBe(defaultWord('en', KEY));
  });
});
