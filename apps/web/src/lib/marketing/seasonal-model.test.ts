// S12 · PR 246 — the seasonal page's parts, its occasion, what the shop answers at its link and what stops it going live.
import { describe, expect, it } from 'vitest';
import { occasionName, occasionOf, publishIssues, SEASONAL_SECTIONS, seasonalInputSchema, seasonalSectionsOf, seasonalServe, showsCutoff } from './seasonal-model';

const COL = '0190a0a0-0000-7000-8000-000000000001';
const LIST = [
  { key: 'eid', en: 'Eid', bn: 'ঈদ' },
  { key: 'winter', en: 'Winter', bn: 'শীত' },
];

describe('seasonal parts', () => {
  it('start in their fixed order with everything but the countdown and the reasons on', () => {
    const s = seasonalSectionsOf([]);
    expect(s.map((x) => x.key)).toEqual([...SEASONAL_SECTIONS]);
    expect(s.filter((x) => x.on).map((x) => x.key)).toEqual(['hero', 'cutoff', 'products', 'articles']);
  });

  it('read the stored rows, ignore archived ones, other types and broken words', () => {
    const s = seasonalSectionsOf([
      { type: 'seasonal.timer', isVisible: true, config: { endsAt: '2027-03-09T18:00:00.000Z' } },
      { type: 'seasonal.products', isVisible: true, config: { collectionId: COL } },
      { type: 'seasonal.reasons', isVisible: true, config: { lines: 'nope' } },
      { type: 'seasonal.hero', isVisible: false, config: {}, archivedAt: new Date() },
      { type: 'landing.hero', isVisible: false, config: {} },
    ]);
    expect(s.find((x) => x.key === 'timer')).toMatchObject({ on: true, config: { endsAt: '2027-03-09T18:00:00.000Z' } });
    expect(s.find((x) => x.key === 'products')?.config.collectionId).toBe(COL);
    expect(s.find((x) => x.key === 'reasons')).toMatchObject({ on: true, config: {} });
    expect(s.find((x) => x.key === 'hero')?.on).toBe(true);
  });
});

describe('the input', () => {
  const base = { titleEn: 'Eid collection', slug: 'eid', occasion: 'eid', sections: {} };
  it('takes a headline, a link part and an occasion key', () => {
    expect(seasonalInputSchema.safeParse(base).success).toBe(true);
    expect(seasonalInputSchema.safeParse({ ...base, slug: 'Eid 2027' }).success).toBe(false);
    expect(seasonalInputSchema.safeParse({ ...base, occasion: 'Eid' }).success).toBe(false);
    expect(seasonalInputSchema.safeParse({ ...base, titleEn: ' ' }).success).toBe(false);
    expect(seasonalInputSchema.safeParse({ ...base, sections: { products: { on: true, config: { collectionId: 'x' } } } }).success).toBe(false);
    expect(seasonalInputSchema.safeParse({ ...base, price: 1 }).success).toBe(false);
  });
});

describe('the occasion', () => {
  it('is kept in recurrence and named in the language asked', () => {
    expect(occasionOf({ occasion: 'eid' })).toBe('eid');
    expect(occasionOf({ occasion: 'Bad Key' })).toBeNull();
    expect(occasionOf(null)).toBeNull();
    expect(occasionName(LIST, 'winter', 'bn')).toBe('শীত');
    expect(occasionName(LIST, 'puja', 'en')).toBe('puja');
  });
  it('shows the order-by line only for a listed occasion', () => {
    expect(showsCutoff({ cutoffOccasions: { eid: true } }, 'eid')).toBe(true);
    expect(showsCutoff({ cutoffOccasions: { eid: true, winter: false } }, 'winter')).toBe(false);
    expect(showsCutoff({ cutoffOccasions: { eid: true } }, null)).toBe(false);
  });
});

describe('what the shop answers', () => {
  const on = { enabled: true, offSeason: true };
  const was = new Date('2026-03-01T00:00:00Z');
  it('serves a live page only while the switch is on', () => {
    expect(seasonalServe({ status: 'PUBLISHED', archivedAt: null, publishedAt: was }, on)).toBe('live');
    expect(seasonalServe({ status: 'PUBLISHED', archivedAt: null, publishedAt: was }, { ...on, enabled: false })).toBeNull();
  });
  it('keeps the link of a page that was live once, never of a draft', () => {
    expect(seasonalServe({ status: 'UNPUBLISHED', archivedAt: null, publishedAt: was }, on)).toBe('resting');
    expect(seasonalServe({ status: 'ARCHIVED', archivedAt: was, publishedAt: was }, on)).toBe('resting');
    expect(seasonalServe({ status: 'UNPUBLISHED', archivedAt: null, publishedAt: was }, { ...on, offSeason: false })).toBeNull();
    expect(seasonalServe({ status: 'DRAFT', archivedAt: null, publishedAt: null }, on)).toBeNull();
  });
});

describe('going live', () => {
  it('needs the collection and the journal category of the parts that are on', () => {
    expect(publishIssues(seasonalSectionsOf([]))).toEqual(['collectionId', 'categoryId']);
    const s = seasonalSectionsOf([
      { type: 'seasonal.products', isVisible: true, config: { collectionId: COL } },
      { type: 'seasonal.articles', isVisible: false, config: {} },
    ]);
    expect(publishIssues(s)).toEqual([]);
  });
});
