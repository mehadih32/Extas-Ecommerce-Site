// S11 · PR 228 — every word the Sitemaps card asks for exists in both languages (a missing one shows its raw key).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';
import { SITEMAP_KINDS } from './sitemap';

const card = readFileSync(join(__dirname, '../../components/admin/website/SitemapsCard.tsx'), 'utf8');

function word(d: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), d);
}

const NUMBERS = ['cacheMinutes', 'perFile', 'maxUrls'];
const families = [...SITEMAP_KINDS.map((k) => `kind.${k}`), ...NUMBERS.flatMap((k) => [`f.${k}`, `f.${k}Hint`]), 'noAddress', 'off', 'make', 'making'];

describe('Website › SEO › Sitemaps words', () => {
  const literal = [...card.matchAll(/\bsm\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the card uses', (_lang, dict) => {
    expect(literal.length).toBeGreaterThan(8);
    const missing = [...new Set([...literal, ...families])].filter((k) => typeof word((dict as Record<string, unknown>).sm, k) !== 'string');
    expect(missing).toEqual([]);
  });

  it('the card fills in only the families checked here', () => {
    const dynamic = [...card.matchAll(/\bsm\(\s*d,\s*`([^`]+)`/g)].map((m) => m[1]!.replace(/\$\{[^}]+\}.*$/, ''));
    expect([...new Set(dynamic)].sort()).toEqual(['f.', 'kind.']);
  });
});
