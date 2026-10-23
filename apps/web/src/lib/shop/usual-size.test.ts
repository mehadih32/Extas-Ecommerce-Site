// Follow-up 62 — the size row's words and "Your size": only the owner's words, only on the pages he chose; the usual
// size apart for tops and bottoms, forgotten after its days, and the colours that still have it.
import { describe, expect, it } from 'vitest';
import type { PdpModel } from './product-model';
import { keepUsual, readUsual, sizeGroupOf, sizeWordsFor, usualElsewhere } from './usual-size';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 23);

describe('size words', () => {
  const set = { show: 'bn' as const, words: { s: { en: 'Small', bn: 'ছোট' }, m: { en: '', bn: 'মাঝারি' } } };
  it('show on the Bengali pages only, unless the owner chose both; an empty word is no word', () => {
    expect(sizeWordsFor(set, 'bn')).toEqual({ s: 'ছোট', m: 'মাঝারি' });
    expect(sizeWordsFor(set, 'en')).toEqual({});
    expect(sizeWordsFor({ ...set, show: 'both' }, 'en')).toEqual({ s: 'Small' });
    expect(sizeWordsFor(null, 'bn')).toEqual({});
  });
});

describe('the usual size', () => {
  it('tops and bottoms keep their own', () => {
    const diagramFor = { polo: 'top', chino: 'bottom' };
    expect(sizeGroupOf('chino', diagramFor)).toBe('bottom');
    expect(sizeGroupOf('polo', diagramFor)).toBe('top');
    expect(sizeGroupOf(null, diagramFor)).toBe('top');
    const raw = keepUsual(keepUsual(null, 'top', 'l', now), 'bottom', 'w32', now);
    expect(readUsual(raw, 'top', 180, now, ['m', 'l'])).toBe('l');
    expect(readUsual(raw, 'bottom', 180, now, ['w30', 'w32'])).toBe('w32');
  });

  it('is forgotten after its days, and never names a size the product does not have', () => {
    const raw = keepUsual(null, 'top', 'l', now - 10 * DAY);
    expect(readUsual(raw, 'top', 30, now, ['l'])).toBe('l');
    expect(readUsual(raw, 'top', 7, now, ['l'])).toBeNull();
    expect(readUsual(raw, 'top', 30, now, ['s', 'm'])).toBeNull();
  });

  it('a broken or foreign value reads as none', () => {
    expect(readUsual('not json', 'top', 30, now, ['l'])).toBeNull();
    expect(readUsual(JSON.stringify({ top: { size: '<b>', at: now } }), 'top', 30, now, ['<b>'])).toBeNull();
    expect(readUsual(JSON.stringify({ top: { size: 'l', at: now + 5 * DAY } }), 'top', 30, now, ['l'])).toBeNull();
    expect(JSON.parse(keepUsual('not json', 'top', 'm', now))).toEqual({ top: { size: 'm', at: now } });
  });

  it('sold out in this colour: the colours that have it; in stock here: none', () => {
    const m = {
      colours: [
        { key: 'navy', name: 'Navy', hex: '#000', note: null },
        { key: 'white', name: 'White', hex: '#fff', note: null },
        { key: 'black', name: 'Black', hex: '#111', note: null },
      ],
      variants: [
        { id: '1', colour: 'navy', size: 'l', stock: 0, price: 0 },
        { id: '2', colour: 'white', size: 'l', stock: 2, price: 0 },
        { id: '3', colour: 'black', size: 'l', stock: 0, price: 0 },
      ],
    } satisfies Pick<PdpModel, 'colours' | 'variants'>;
    expect(usualElsewhere(m, 'navy', 'l')).toEqual([{ key: 'white', name: 'White' }]);
    expect(usualElsewhere(m, 'white', 'l')).toEqual([]);
  });
});
