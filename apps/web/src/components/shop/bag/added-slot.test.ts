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
});
