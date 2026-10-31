// S11 · PR 229 — every word the Robots and AI assistants card asks for exists in both languages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';

const card = readFileSync(join(__dirname, '../../components/admin/website/RobotsCard.tsx'), 'utf8');

describe('Website › SEO › Robots words', () => {
  const used = [...card.matchAll(/\brb\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the card uses', (_lang, dict) => {
    expect(used.length).toBeGreaterThan(8);
    const rb = dict.rb as Record<string, unknown>;
    expect(used.filter((k) => typeof rb[k] !== 'string')).toEqual([]);
  });

  it('the card fills in no word from a variable', () => {
    expect(card).not.toMatch(/\brb\(\s*d,\s*`/);
  });
});
