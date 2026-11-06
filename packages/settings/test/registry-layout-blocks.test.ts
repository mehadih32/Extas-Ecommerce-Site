// S02 · PR 595 — the page layout builder's own sections (`layout.blocks`) and one category's own layout
// (`layout.categoryOwn`): both ship empty (today's pages), every section type starts from valid words, and the schema
// refuses what the shop must never draw (an unsafe link, a section on a page it does not belong to, days backwards).
import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES, blockDefaults, categoryOwnSchema, layoutBlocksSchema, registry, type LayoutBlock } from '../src';

const one = (over: Partial<LayoutBlock> & Record<string, unknown> = {}) => ({
  id: 'abc123',
  page: 'home',
  cat: null,
  name: 'New offer',
  on: false,
  dev: 'both',
  from: null,
  to: null,
  before: 'reviews',
  type: 'offerStrip',
  data: blockDefaults('offerStrip'),
  ...over,
});

describe('layout.blocks and layout.categoryOwn (PR 595, registry v244)', () => {
  it('ship empty at version 244, so the pages stay as they are', () => {
    expect(registry['layout.blocks'].default).toEqual([]);
    expect(registry['layout.categoryOwn'].default).toEqual([]);
    expect(registry['layout.blocks'].version).toBe(244);
    expect(registry['layout.categoryOwn'].version).toBe(244);
  });

  it('every section type starts from words and numbers the schema takes', () => {
    const list = BLOCK_TYPES.map((type, i) => one({ id: `blk00${i}`, type, data: blockDefaults(type) } as never));
    expect(layoutBlocksSchema.safeParse(list).success).toBe(true);
    expect(blockDefaults('spacer')).not.toBe(blockDefaults('spacer'));
  });

  it('refuses an unsafe link, a wrong page anchor, a category on the home page, days backwards and a twin id', () => {
    const bad = (b: unknown) => layoutBlocksSchema.safeParse([b]).success;
    expect(bad(one({ data: { ...blockDefaults('offerStrip'), href: 'javascript:alert(1)' } }))).toBe(false);
    expect(bad(one({ data: { ...blockDefaults('offerStrip'), href: '//evil.example' } }))).toBe(false);
    expect(bad(one({ data: { ...blockDefaults('offerStrip'), href: '/collections/polo' } }))).toBe(true);
    expect(bad(one({ data: { ...blockDefaults('offerStrip'), href: 'https://example.com/a' } }))).toBe(true);
    expect(bad(one({ before: 'listing' }))).toBe(false);
    expect(bad(one({ page: 'category', before: 'listing', cat: 'polo' }))).toBe(true);
    expect(bad(one({ cat: 'polo' }))).toBe(false);
    expect(bad(one({ from: '2026-11-10', to: '2026-11-09' }))).toBe(false);
    expect(bad(one({ from: '2026-11-10', to: '2026-11-10' }))).toBe(true);
    expect(bad(one({ type: 'spacer', data: { phone: 500, desktop: 0 } }))).toBe(false);
    expect(layoutBlocksSchema.safeParse([one(), one()]).success).toBe(false);
  });

  it('keeps one own layout per category, with the category page rules (heading and products always shown)', () => {
    const rows = [
      { id: 'listing', on: true },
      { id: 'head', on: true },
    ];
    expect(categoryOwnSchema.safeParse([{ cat: 'polo', on: true, rows }]).success).toBe(true);
    expect(categoryOwnSchema.safeParse([{ cat: 'polo', on: true, rows: [{ id: 'head', on: false }] }]).success).toBe(false);
    expect(categoryOwnSchema.safeParse([{ cat: 'polo', on: true, rows }, { cat: 'polo', on: false, rows }]).success).toBe(false);
  });
});
