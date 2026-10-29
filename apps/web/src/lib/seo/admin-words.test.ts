// S11 · PR 221 — every word the Website › SEO screen asks for exists in both languages (a missing one shows its raw
// key on the screen, as the titles card's field labels once did).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEO_PAGE_TYPES, SEO_TEMPLATE_TOKENS, namingTokens } from '@extas/settings';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';

const SCREENS = ['../../components/admin/website/SeoScreen.tsx', '../../components/admin/website/SeoTexts.tsx', '../../app/admin/website/seo/page.tsx'];
const source = SCREENS.map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n');

function word(d: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((at, k) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined), d);
}

// the families the screens fill in with a variable, each with every value it can take
const families = [
  ...['title', 'description'].flatMap((f) => ['en', 'bn'].map((l) => `titles.field.${f}.${l}`)),
  ...['title', 'description'].map((f) => `titles.max.${f}`),
  ...[...new Set([...namingTokens, ...Object.values(SEO_TEMPLATE_TOKENS).flat()])].flatMap((t) => [`titles.token.${t}`, `titles.sample.${t}`]),
  ...SEO_PAGE_TYPES.map((k) => `indexing.page.${k}`),
  ...['product', 'category'].map((k) => `ai.subject.${k}`),
  ...['en', 'bn'].map((k) => `ai.lang.${k}`),
];

describe('Website › SEO words', () => {
  const literal = [...source.matchAll(/seoText\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the screen uses', (_lang, dict) => {
    const missing = [...new Set([...literal, ...families])].filter((k) => typeof word(dict, k) !== 'string');
    expect(missing).toEqual([]);
  });

  it('the screen fills in only the families checked here', () => {
    const used = [...source.matchAll(/seoText\(\s*d,\s*`([^`]+)`/g)].map((m) => m[1]!.replace(/\$\{[^}]+\}/g, '*'));
    const known = new Set(families.map((k) => k.replace(/\.[^.]+$/, '.*').replace(/^titles\.field\.[^.]+\.\*$/, 'titles.field.*.*')));
    expect(used.filter((k) => !known.has(k))).toEqual([]);
  });
});
