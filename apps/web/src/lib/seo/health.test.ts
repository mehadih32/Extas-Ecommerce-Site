// S11 · PR 237 — the SEO health list: only pages with something missing, each issue named, counted per issue.
import { describe, expect, it } from 'vitest';
import { healthCounts, healthRows } from './health';

const p = (id: string, over: Partial<{ description: string | null; photos: number; photosNoAlt: number }> = {}) => ({ id, slug: id, name: `Sample ${id}`, description: 'Sample words', photos: 2, photosNoAlt: 0, ...over });
const c = (slug: string, over: Partial<{ text: string | null; searchLine: string | null; styles: number }> = {}) => ({ slug, name: slug, text: 'Sample text', searchLine: 'Sample line', styles: 3, ...over });

describe('PR 237 · SEO health', () => {
  it('a complete page is not listed; each missing thing is named, products first', () => {
    const rows = healthRows([p('a'), p('b', { description: ' ', photos: 0 }), p('c', { photosNoAlt: 2 })], [c('polos'), c('hoodies', { styles: 0, text: null, searchLine: '' })], '/p');
    expect(rows.map((r) => [r.key, r.issues])).toEqual([
      ['p:b', ['noDescription', 'noPhoto']],
      ['p:c', ['photoNoAlt']],
      ['c:hoodies', ['noStyles', 'noText', 'noSearchLine']],
    ]);
    expect(rows[0]).toMatchObject({ path: '/p/b', fix: '/admin/products/b' });
    expect(rows[2]).toMatchObject({ path: '/collections/hoodies', fix: '/admin/website/seo/categories' });
    expect(healthCounts(rows)).toEqual({ noDescription: 1, noPhoto: 1, photoNoAlt: 1, noText: 1, noSearchLine: 1, noStyles: 1 });
  });
});
