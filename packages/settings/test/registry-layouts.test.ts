// S02 · PR 76 (registry v240): the page builder's category list — at version 240, public, never owner data, labelled in
// both languages, today's page by default; home sections take their screens (optional) and stay valid without them.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { BAG_SECTIONS, bagLayoutSchema, CATEGORY_SECTIONS, categoryLayoutSchema, layoutSettings, PRODUCT_SECTIONS, productLayoutSchema } from '../src/registry-layouts';
import { HOME_SECTIONS, homeSectionsSchema } from '../src/registry-storefront';

describe('layout.* (v240, v241)', () => {
  it('is in the registry at version 240, store-level, public, today\'s order, labelled in English and Bengali', () => {
    const spec = layoutSettings['layout.category'];
    expect(registry['layout.category']).toBe(spec);
    expect(spec.version).toBe(240);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(true);
    expect(spec.default).toEqual(CATEGORY_SECTIONS.map((id) => ({ id, on: true })));
    expect(categoryLayoutSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('never hides the heading or the listing; screens are both, phone or desktop', () => {
    expect(categoryLayoutSchema.safeParse([{ id: 'listing', on: false }]).success).toBe(false);
    expect(categoryLayoutSchema.safeParse([{ id: 'info', on: false, dev: 'phone' }, { id: 'head', on: true, dev: 'desktop' }]).success).toBe(true);
    expect(categoryLayoutSchema.safeParse([{ id: 'info', on: true, dev: 'watch' }]).success).toBe(false);
    expect(homeSectionsSchema.safeParse(HOME_SECTIONS.map((id) => ({ id, on: true }))).success).toBe(true);
    expect(homeSectionsSchema.safeParse([{ id: 'hero', on: true, dev: 'phone' }]).success).toBe(true);
  });

  it('PR 77 (v241): the product page and bag lists, today\'s order, labelled; the bag\'s lines never hide', () => {
    for (const [key, ids] of [['layout.product', PRODUCT_SECTIONS], ['layout.bag', BAG_SECTIONS]] as const) {
      const spec = layoutSettings[key];
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(241);
      expect(spec.isPublic).toBe(true);
      expect(spec.default).toEqual(ids.map((id) => ({ id, on: true })));
      for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
    }
    expect(bagLayoutSchema.safeParse([{ id: 'lines', on: false }]).success).toBe(false);
    expect(productLayoutSchema.safeParse(PRODUCT_SECTIONS.map((id) => ({ id, on: false }))).success).toBe(true);
  });
});

