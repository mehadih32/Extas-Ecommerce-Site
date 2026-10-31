// S11 · PR 232 — every word the Photo descriptions card asks for exists in both languages; the example is English in both.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/admin-seo.en.json';
import bn from '../../../messages/admin-seo.bn.json';

const card = readFileSync(join(__dirname, '../../components/admin/website/AltTextCard.tsx'), 'utf8');

describe('Website › SEO › Photo descriptions words', () => {
  const used = [...card.matchAll(/\bat\(\s*d,\s*"([^"]+)"/g)].map((m) => m[1]!);
  // the ternaries name two words at once
  const both = [...card.matchAll(/\bat\(\s*d,\s*\w+\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)].flatMap((m) => [m[1]!, m[2]!]);

  it.each([
    ['en', en],
    ['bn', bn],
  ])('%s has every word the card uses', (_lang, dict) => {
    expect(used.length).toBeGreaterThan(8);
    expect(both).toEqual(['missingHint', 'none', 'filling', 'fill']);
    const at = dict.at as Record<string, unknown>;
    expect([...used, ...both].filter((k) => typeof at[k] !== 'string')).toEqual([]);
  });

  it('the example names the same sample product in both languages (it shows the English that goes live)', () => {
    expect(bn.at.sampleName).toBe(en.at.sampleName);
    expect(bn.at.sampleColour).toBe(en.at.sampleColour);
  });
});
