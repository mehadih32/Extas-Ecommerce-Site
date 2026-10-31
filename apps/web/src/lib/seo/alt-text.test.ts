// S11 · PR 232 — the photo descriptions the shop writes read like the product page's own, in its words.
import { describe, expect, it } from 'vitest';
import en from '../../../messages/shop.en.json';
import bn from '../../../messages/shop.bn.json';
import { altTextFor, clipWords, type AltWords } from './alt-text';

const wordsOf =
  (dict: Record<string, unknown>): AltWords =>
  (key, vars = {}) => {
    const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
    return String(raw).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  };

describe('Website › SEO › photo descriptions (PR 232)', () => {
  const w = wordsOf(en);
  it('names the product, its colour and the kind of photo, as the product page does', () => {
    expect(altTextFor({ name: 'Oxford shirt', colour: 'Navy', role: 'FRONT' }, w, 125)).toBe('Oxford shirt in Navy, Front photo');
    expect(altTextFor({ name: 'Oxford shirt', colour: null, role: 'FABRIC' }, w, 125)).toBe('Oxford shirt, Fabric photo');
    expect(altTextFor({ name: '  Oxford   shirt ', colour: ' Sky  blue ', role: 'ON_MODEL' }, w, 125)).toBe('Oxford shirt in Sky blue, On model photo');
  });

  it('writes nothing for a video or a product with no name yet', () => {
    expect(altTextFor({ name: 'Oxford shirt', colour: 'Navy', role: 'VIDEO' }, w, 125)).toBeNull();
    expect(altTextFor({ name: ' ', colour: 'Navy', role: 'FRONT' }, w, 125)).toBeNull();
    expect(altTextFor({ name: 'Oxford shirt', colour: 'Navy', role: 'NOT_A_ROLE' }, w, 125)).toBeNull();
  });

  it('keeps to the length the owner set, cut at a whole word', () => {
    const long = altTextFor({ name: 'A very long name for a shirt with many words', colour: 'Navy', role: 'TRUE_COLOUR' }, w, 60)!;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toBe('A very long name for a shirt with many words in Navy, True');
    expect(clipWords('abcdefghij', 4)).toBe('abcd');
    expect(clipWords('short', 40)).toBe('short');
  });

  it('the Bengali words give the Bengali form (what a Bengali page shows)', () => {
    expect(altTextFor({ name: 'অক্সফোর্ড শার্ট', colour: 'নেভি', role: 'BACK' }, wordsOf(bn), 125)).toBe('নেভি রঙে অক্সফোর্ড শার্ট, পেছনের ছবি');
  });
});
