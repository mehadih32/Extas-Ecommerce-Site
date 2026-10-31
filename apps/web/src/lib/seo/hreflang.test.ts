// S11 · PR 236 — which Bengali-ready pages name their language pair, their addresses, the tags such a page carries, and
// every word the "Language pairs" card asks for in both languages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';
import { hreflangTags, languagePairs, pathOfPageKey } from './hreflang';

const policy = registry['seo.indexing'].default;
const pick = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

describe('language pairs (PR 236)', () => {
  it('turns each page key into its English address', () => {
    expect(['home', 'help-faq', 'p/essential-pique-polo', 'collections/new-in', 'combos', 'combos/build-your-own', 'combo/navy-white-2-piece'].map(pathOfPageKey)).toEqual([
      '/',
      '/help/faq',
      '/p/essential-pique-polo',
      '/collections/new-in',
      '/combos',
      '/combos/build-your-own',
      '/combo/navy-white-2-piece',
    ]);
  });

  it('lists each ready page once; a kind hidden from search engines names no pair; none while Bengali is off', () => {
    const ready = ['home', 'p/polo', 'search', 'home', 'collections/new-in'];
    const pairs = languagePairs({ bengaliOn: true, ready, policy, productPathPrefix: 'p' });
    expect(pairs.map((p) => [p.path, p.named])).toEqual([
      ['/', true],
      ['/p/polo', true],
      ['/search', false],
      ['/collections/new-in', true],
    ]);
    expect(languagePairs({ bengaliOn: true, ready, policy: { ...policy, pages: { ...policy.pages, product: false } }, productPathPrefix: 'p' })[1]!.named).toBe(false);
    expect(languagePairs({ bengaliOn: false, ready, policy, productPathPrefix: 'p' })).toEqual([]);
  });

  it('the tags: en, bn and x-default → English, absolute on the shop address (paths alone with none yet)', () => {
    expect(hreflangTags(new URL('https://shop.example.test'), '/p/polo', 'en')).toEqual([
      { code: 'en', href: 'https://shop.example.test/p/polo' },
      { code: 'bn', href: 'https://shop.example.test/bn/p/polo' },
      { code: 'x-default', href: 'https://shop.example.test/p/polo' },
    ]);
    expect(hreflangTags(new URL('https://shop.example.test'), '/', 'none').map((t) => t.href)).toEqual(['https://shop.example.test/', 'https://shop.example.test/bn']);
    expect(hreflangTags(null, '/', 'en').map((t) => t.href)).toEqual(['/', '/bn', '/']);
  });

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the card uses', (_lang, dict) => {
    const card = readFileSync(join(__dirname, '../../components/admin/website/HreflangCard.tsx'), 'utf8');
    const plain = [...card.matchAll(/\bhl\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);
    const ternary = [...card.matchAll(/\bhl\(\s*d,\s*[^"`)]+\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)].flatMap((m) => [m[1]!, m[2]!]);
    expect(plain.length).toBeGreaterThan(8);
    expect(ternary).toEqual(expect.arrayContaining(['tagsHint', 'tagsHintNoDefault', 'yes', 'hidden']));
    expect([...plain, ...ternary, 'off', 'noneReady', 'count'].filter((k) => typeof pick(dict.hl, k) !== 'string')).toEqual([]);
  });
});
