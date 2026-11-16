import { describe, expect, it } from 'vitest';
import { seoScore } from './seo-score';

const good = {
  title: 'Navy Polo Shirt for Men — Soft Cotton Piqué',
  description: 'A soft navy polo shirt for men made in Bangladesh, with cash on delivery all over the country and easy size exchange within 7 days.',
  slug: 'navy-polo',
  keyword: 'polo',
  photos: 3,
  colours: 3,
};

describe('seoScore', () => {
  it('gives 100 when every check passes', () => {
    const s = seoScore(good);
    expect(s.score).toBe(100);
    expect(s.band).toBe('good');
    expect(s.tips).toEqual([]);
  });
  it('takes the prototype points off for each miss and names the tip', () => {
    const s = seoScore({ ...good, title: 'Polo', description: 'Nice.', slug: 'x'.repeat(46), photos: 0 });
    expect(s.tips.map((t) => t.key).sort()).toEqual(['description', 'photos', 'place', 'slug', 'title']);
    expect(s.score).toBe(100 - 15 - 20 - 10 - 5 - 10);
    expect(s.band).toBe('weak');
  });
  it('asks for the category word when neither the title nor the description has it', () => {
    const s = seoScore({ ...good, title: 'Navy shirt for men, soft cotton fabric', description: good.description.replace('polo shirt', 'top'), keyword: 'polo' });
    expect(s.tips).toContainEqual({ key: 'keyword', keyword: 'polo' });
    expect(s.score).toBe(85);
    expect(s.band).toBe('good');
  });
  it('is 25 at the very worst (every point gone)', () => {
    expect(seoScore({ ...good, title: '', description: '', slug: 'x'.repeat(60), photos: 0, keyword: 'polo' }).score).toBe(25);
  });
});
