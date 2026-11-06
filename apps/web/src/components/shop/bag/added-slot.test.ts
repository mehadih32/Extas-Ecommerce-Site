// Follow-up 21 — closing the added-to-bag panel on a page with Quick add goes back to the same address without `added`.
import { describe, expect, it } from 'vitest';
import { closeHrefOf } from './AddedSlot';

describe('closeHrefOf', () => {
  it('drops only `added` and keeps the shopper’s filters', () => {
    expect(closeHrefOf('/collections/polos', { added: 'x', size: 'M', sort: 'price-asc' })).toBe('/collections/polos?size=M&sort=price-asc');
    expect(closeHrefOf('/bn', { added: 'x' })).toBe('/bn');
    expect(closeHrefOf('/', {})).toBe('/');
  });
  it('keeps a repeated filter whole and leaves out an empty one', () => {
    expect(closeHrefOf('/collections/polos', { added: 'x', size: ['M', 'L'], q: undefined })).toBe('/collections/polos?size=M&size=L');
  });
  it('follow-up 118: on the search results it keeps the words and the filters', () => {
    expect(closeHrefOf('/search', { q: 'polo', added: 'x', size: 'M' })).toBe('/search?q=polo&size=M');
  });
});

describe('follow-up 118 · the search results page mounts the cards\' back view and Quick add like a category', () => {
  it('draws CardDeskMount and the added-to-bag panel on both of its card pages (results, and nothing found)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../app/(shop)/(store)/search/page.tsx', import.meta.url), 'utf8');
    expect(src.match(/<CardDeskMount c=\{c\} \/>/g)?.length).toBe(2);
    expect(src.match(/<AddedSlot c=\{c\} added=\{sp\.added\} closeHref=\{closeHref\} \/>/g)?.length).toBe(2);
  });
});
