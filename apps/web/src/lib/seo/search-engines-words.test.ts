// S11 · PR 233 — every word the Search Console and Bing card asks for exists in both languages, the dynamic families
// (engines, outcomes, blocks) complete.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';
import { ENGINES } from './search-engines';

const card = readFileSync(join(__dirname, '../../components/admin/website/SearchEnginesCard.tsx'), 'utf8');
const pick = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

describe('Website › SEO › Search Console and Bing words', () => {
  const plain = [...card.matchAll(/\bse\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);
  const families = [
    ...ENGINES.flatMap((e) => [`codes.${e.engine}`, `engine.${e.engine}`]),
    ...['sent', 'practice', 'noProperty', 'unreachable', 'failed'].map((s) => `out.${s}`),
    ...['noDomain', 'sitemapsOff'].map((b) => `blocked.${b}`),
    'sending',
    'send',
  ];

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the card uses', (_lang, dict) => {
    expect(plain.length).toBeGreaterThan(10);
    expect([...plain, ...families].filter((k) => typeof pick(dict.se, k) !== 'string')).toEqual([]);
  });
});
