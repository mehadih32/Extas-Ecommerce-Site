// PR 602 follow-up 400 — the Server page's cache card from the cache service's status: both layers always shown, in
// order, with their hits, misses, reuse and what is kept now; a layer not read yet shows no percent, never 0 %.
import { describe, expect, it } from 'vitest';
import { cacheCardOf, CACHE_CARD_LAYERS } from './cache-card';

describe('follow-up 400 · the cache card', () => {
  it('both layers with today\'s counts, reuse and entries kept; Cloudflare and the last clear', () => {
    const card = cacheCardOf({
      counts: { page: { hits: 90, misses: 10 }, stock: { hits: 3, misses: 1 }, other: { hits: 5, misses: 5 } },
      hitRate: { page: 90, stock: 75 },
      entries: { page: 42, stock: 7 },
      shared: true,
      cdn: { mode: 'MOCK' },
      values: { 'cache.pages': { cdn: false } },
      lastCleared: { at: '2026-11-06T10:00:00.000Z' },
    });
    expect(card).toEqual({
      layers: [
        { layer: 'page', hits: 90, misses: 10, percent: 90, kept: 42 },
        { layer: 'stock', hits: 3, misses: 1, percent: 75, kept: 7 },
      ],
      shared: true,
      cdn: 'MOCK',
      cdnPages: false,
      lastCleared: '2026-11-06T10:00:00.000Z',
    });
  });

  it('a fresh process: every layer drawn with zeros and no percent; no Cloudflare, never cleared', () => {
    const card = cacheCardOf({ counts: {}, hitRate: { page: null, stock: null }, entries: {}, shared: false, cdn: null, values: { 'cache.pages': { cdn: true } }, lastCleared: null });
    expect(card.layers.map((l) => l.layer)).toEqual([...CACHE_CARD_LAYERS]);
    expect(card.layers.every((l) => l.hits === 0 && l.misses === 0 && l.kept === 0 && l.percent === null)).toBe(true);
    expect(card).toMatchObject({ shared: false, cdn: null, cdnPages: true, lastCleared: null });
  });
});
