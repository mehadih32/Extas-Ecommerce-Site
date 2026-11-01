// S13 · PR 254 — the landing page's parts, pure: the fixed order and defaults, the stored rows read back, the link rule,
// the states, the countdown and the bag line's source (the same text the checkout reads).
import { LANDING_LINE_SOURCE } from '@extas/checkout';
import { describe, expect, it } from 'vitest';
import { LANDING_SECTIONS, LANDING_SOURCE_PREFIX, showsTryOn, landingInputSchema, landingSource, secondsLeft, sectionsOf, sectionType, slugify, stateOf } from './landing-model';

describe('landing page parts (PR 254)', () => {
  it('a page never saved has every part in the fixed order, all on but the countdown', () => {
    const s = sectionsOf([]);
    expect(s.map((x) => x.key)).toEqual([...LANDING_SECTIONS]);
    expect(s.filter((x) => !x.on).map((x) => x.key)).toEqual(['timer']);
  });

  it('stored rows win, in the fixed order whatever their position; an archived or unknown row is ignored', () => {
    const s = sectionsOf([
      { type: sectionType('timer'), isVisible: true, config: { endsAt: '2026-12-01T00:00:00+06:00' } },
      { type: sectionType('reviews'), isVisible: false, config: null },
      { type: sectionType('hero'), isVisible: false, config: null, archivedAt: new Date() },
      { type: 'hero', isVisible: false, config: null },
      { type: sectionType('benefits'), isVisible: true, config: { lines: 'bad' } },
    ]);
    expect(s.find((x) => x.key === 'timer')).toMatchObject({ on: true, config: { endsAt: '2026-12-01T00:00:00+06:00' } });
    expect(s.find((x) => x.key === 'reviews')?.on).toBe(false);
    expect(s.find((x) => x.key === 'hero')?.on).toBe(true);
    expect(s.find((x) => x.key === 'benefits')?.config).toEqual({});
  });

  it('the link: lower-case words and single hyphens; a headline turns into one', () => {
    expect(slugify('Polo Duo — any 2 colours!')).toBe('polo-duo-any-2-colours');
    const base = { titleEn: 'Polo Duo', slug: 'polo-duo', productId: '0190a0a0-0000-7000-8000-000000000001', sections: {} };
    expect(landingInputSchema.safeParse(base).success).toBe(true);
    expect(landingInputSchema.safeParse({ ...base, slug: 'Polo Duo' }).success).toBe(false);
    expect(landingInputSchema.safeParse({ ...base, slug: 'polo--duo' }).success).toBe(false);
    expect(landingInputSchema.safeParse({ ...base, titleEn: ' ' }).success).toBe(false);
    expect(landingInputSchema.safeParse({ ...base, priceMinor: 1 }).success).toBe(false);
  });

  it('states, the countdown and the bag line source', () => {
    expect(stateOf({ status: 'PUBLISHED', archivedAt: null })).toBe('live');
    expect(stateOf({ status: 'PUBLISHED', archivedAt: new Date() })).toBe('archived');
    expect(stateOf({ status: 'UNPUBLISHED', archivedAt: null })).toBe('off');
    expect(stateOf({ status: 'DRAFT', archivedAt: null })).toBe('draft');
    const now = new Date('2026-11-01T00:00:00Z');
    expect(secondsLeft('2026-11-01T01:00:00Z', now)).toBe(3600);
    expect(secondsLeft('2026-10-31T23:00:00Z', now)).toBeNull();
    expect(secondsLeft(null, now)).toBeNull();
    expect(LANDING_SOURCE_PREFIX).toBe(LANDING_LINE_SOURCE);
    expect(landingSource('x')).toBe('lp-x');
    // the cart takes a source of a-z, 0-9 and hyphens, at most 40 (packages/cart addItem)
    expect(landingSource('0190a0a0-0000-7000-8000-000000000001')).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  it('SIM-F-034: the try-on line shows on the landing page whenever the checkout or the product page promises it', () => {
    const rules = { on: true, trialLine: false };
    expect(showsTryOn({ tryOn: true, rules })).toBe(true);
    expect(showsTryOn({ tryOn: false, rules: { on: true, trialLine: true } })).toBe(true);
    expect(showsTryOn({ tryOn: false, rules: { on: false, trialLine: true } })).toBe(false);
    expect(showsTryOn({ tryOn: false, rules })).toBe(false);
  });
});
