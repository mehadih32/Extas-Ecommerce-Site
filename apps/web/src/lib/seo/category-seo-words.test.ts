// S11 · PR 227 — every word Website › SEO › Collection pages asks for exists in both languages (a missing one shows its
// raw key on the screen), and the screen's field limits are the setting's own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEO_FILTER_KINDS } from '@extas/settings';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';

const cards = readFileSync(join(__dirname, '../../components/admin/website/CategorySeoCards.tsx'), 'utf8');
const page = readFileSync(join(__dirname, '../../app/admin/website/seo/categories/page.tsx'), 'utf8');

function word(d: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), d);
}

const FIELDS = ['title', 'meta', 'heading', 'text'];
const families = [...FIELDS.flatMap((f) => [`f.${f}`, `f.${f}Hint`]), ...['en', 'bn'].flatMap((l) => [`lang.${l}`, `fp.label.${l}`]), ...SEO_FILTER_KINDS.map((k) => `fp.kind.${k}`), 'fp.twin', 'fp.full'];

describe('Website › SEO › Collection pages words', () => {
  const literal = [...[...cards.matchAll(/\bcs\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!), ...[...page.matchAll(/\bc\("([^"]+)"/g)].map((m) => m[1]!), 'metaTitle'];

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the screen uses', (_lang, dict) => {
    expect(literal.length).toBeGreaterThan(20);
    const missing = [...new Set([...literal, ...families])].filter((k) => typeof word((dict as Record<string, unknown>).cs, k) !== 'string');
    expect(missing).toEqual([]);
  });

  it('the screen fills in only the families checked here', () => {
    const dynamic = [...cards.matchAll(/\bcs\(\s*d,\s*`([^`]+)`/g)].map((m) => m[1]!.replace(/\$\{[^}]+\}.*$/, ''));
    expect([...new Set(dynamic)].sort()).toEqual(['f.', 'fp.kind.', 'fp.label.', 'lang.']);
  });
});
