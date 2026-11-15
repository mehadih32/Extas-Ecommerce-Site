// PR 745–749 — the footer boxes setting and the three customisation settings: empty as shipped (so the approved shop is
// unchanged), and strict about what the owner may save.
import { describe, expect, it } from 'vitest';
import { collectionOrderSchema, tagBadgesSchema } from '../src/registry-customise';
import { registry } from '../src/registry';
import { FOOTER_BLOCKS, footerSchema, storefrontSettings } from '../src/registry-storefront';

describe('PR 745 · the footer boxes setting', () => {
  it('blockOrder is not set as shipped, so the approved footer is unchanged', () => {
    expect(storefrontSettings['shell.footer'].default.blockOrder).toBeUndefined();
    expect(footerSchema.safeParse(storefrontSettings['shell.footer'].default).success).toBe(true);
  });

  it('it names the boxes once each and always keeps the last line', () => {
    const base = storefrontSettings['shell.footer'].default;
    expect(FOOTER_BLOCKS).toHaveLength(7);
    expect(footerSchema.safeParse({ ...base, blockOrder: ['pay', 'legal'] }).success).toBe(true);
    expect(footerSchema.safeParse({ ...base, blockOrder: ['pay', 'pay', 'legal'] }).success).toBe(false);
    expect(footerSchema.safeParse({ ...base, blockOrder: ['pay'] }).success).toBe(false);
    expect(footerSchema.safeParse({ ...base, blockOrder: ['sidebar', 'legal'] }).success).toBe(false);
  });
});

describe('PR 745–749 · link preview picture, tag badges, collection order', () => {
  it('all three are empty as shipped', () => {
    expect(registry['brand.ogImage'].default).toBeNull();
    expect(registry['card.tagBadges'].default).toEqual({ order: [], hidden: [], labels: {} });
    expect(registry['catalogue.collections.order'].default).toEqual([]);
  });

  it('the picture is a media id and owner data (never shipped to another installation)', () => {
    expect(registry['brand.ogImage'].isOwnerData).toBe(true);
    expect(registry['brand.ogImage'].schema.safeParse('not-an-id').success).toBe(false);
    expect(registry['brand.ogImage'].schema.safeParse('3f2b8c1e-5d4a-4e8b-9c7d-1a2b3c4d5e6f').success).toBe(true);
  });

  it('the tag badges refuse a tag twice, a half-written label and a badge word that is too long', () => {
    expect(tagBadgesSchema.safeParse({ order: ['new', 'new'], hidden: [], labels: {} }).success).toBe(false);
    expect(tagBadgesSchema.safeParse({ order: ['new'], hidden: [], labels: { new: { en: 'New', bn: '' } } }).success).toBe(false);
    expect(tagBadgesSchema.safeParse({ order: ['new'], hidden: [], labels: { new: { en: 'x'.repeat(25), bn: 'নতুন' } } }).success).toBe(false);
    expect(tagBadgesSchema.safeParse({ order: ['new'], hidden: ['old'], labels: { new: { en: 'New', bn: 'নতুন' } } }).success).toBe(true);
  });

  it('the collection order names each collection once', () => {
    expect(collectionOrderSchema.safeParse(['eid', 'winter']).success).toBe(true);
    expect(collectionOrderSchema.safeParse(['eid', 'eid']).success).toBe(false);
  });
});
