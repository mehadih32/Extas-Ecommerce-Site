// S02 · PR 76 — the page builder's model: the full list keeps the saved order, adds what the save does not name
// (hidden, or shown when locked), drops strangers and twins; the shown list carries each section's screens; moves.
import { describe, expect, it } from 'vitest';
import { BAG_SECTIONS, bagLayoutSchema, CATEGORY_SECTIONS, categoryLayoutSchema, HOME_SECTIONS, homeSectionsSchema, PRODUCT_SECTIONS, productLayoutSchema, registry } from '@extas/settings';
import { defaultLayout, deviceClass, fullLayout, isLayoutPage, moveRow, shownSections } from './layouts';

describe('page layouts (PR 76)', () => {
  it('draws today\'s pages by default: every section shown, in the shop\'s order, on both screens', () => {
    expect(defaultLayout('home').map((r) => r.id)).toEqual([...HOME_SECTIONS]);
    expect(defaultLayout('category')).toEqual(CATEGORY_SECTIONS.map((id) => ({ id, on: true })));
    expect(shownSections('category', registry['layout.category'].default)).toEqual(CATEGORY_SECTIONS.map((id) => ({ id, dev: 'both' })));
  });

  it('keeps the saved order, appends what the save leaves out hidden (locked ones shown) and drops strangers and twins', () => {
    const saved = [{ id: 'info', on: true, dev: 'desktop' as const }, { id: 'nope', on: true }, { id: 'info', on: false }, { id: 'head', on: false }];
    expect(fullLayout('category', saved)).toEqual([
      { id: 'info', on: true, dev: 'desktop' },
      { id: 'head', on: true },
      { id: 'listing', on: true },
      { id: 'related', on: false },
    ]);
    // home: a section missing from the save stays hidden, as before PR 76
    expect(shownSections('home', [{ id: 'reviews', on: true, dev: 'phone' }, { id: 'hero', on: true }])).toEqual([
      { id: 'reviews', dev: 'phone' },
      { id: 'hero', dev: 'both' },
    ]);
  });

  it('keeps a section to its screens with a class, none for both; moves rows and ignores moves out of range', () => {
    expect([deviceClass('both'), deviceClass('phone'), deviceClass('desktop')]).toEqual([null, 'ly-phone', 'ly-desk']);
    expect(moveRow(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveRow(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(isLayoutPage('category')).toBe(true);
    expect(isLayoutPage('toString')).toBe(false);
  });

  it('the settings refuse a hidden heading or listing, twins and unknown screens; home takes screens too', () => {
    expect(categoryLayoutSchema.safeParse([{ id: 'head', on: false }]).success).toBe(false);
    expect(categoryLayoutSchema.safeParse([{ id: 'info', on: true }, { id: 'info', on: false }]).success).toBe(false);
    expect(categoryLayoutSchema.safeParse([{ id: 'info', on: true, dev: 'tablet' }]).success).toBe(false);
    expect(categoryLayoutSchema.safeParse([{ id: 'related', on: false, dev: 'phone' }]).success).toBe(true);
    expect(homeSectionsSchema.safeParse([{ id: 'hero', on: true, dev: 'desktop' }, { id: 'reviews', on: true }]).success).toBe(true);
  });

  it('PR 77: the product page\'s foot and the bag\'s left column draw today\'s order; the bag\'s lines never hide', () => {
    expect(defaultLayout('product').map((r) => r.id)).toEqual([...PRODUCT_SECTIONS]);
    expect(defaultLayout('bag').map((r) => r.id)).toEqual([...BAG_SECTIONS]);
    expect(fullLayout('bag', [{ id: 'saved', on: true }, { id: 'lines', on: false }]).slice(0, 2)).toEqual([
      { id: 'saved', on: true },
      { id: 'lines', on: true },
    ]);
    expect(bagLayoutSchema.safeParse([{ id: 'lines', on: false }]).success).toBe(false);
    expect(productLayoutSchema.safeParse([{ id: 'rows', on: false, dev: 'phone' }]).success).toBe(true);
  });
});
