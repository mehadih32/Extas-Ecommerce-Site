// PR 622 (CN-034) — "Buy again", the pure part: what comes back, what today's catalogue says, when it is offered.
import { describe, expect, it } from 'vitest';
import { accountReorderSchema, registry } from '@extas/settings';
import { reorderOffered, reorderParts, reorderVerdict, type ReorderFact, type ReorderItem } from './reorder-pure';

const item = (over: Partial<ReorderItem>): ReorderItem => ({ id: 'i', variantId: 'v1', productId: 'p', productName: 'Shirt', colourName: 'Sky', sizeLabel: 'M', quantity: 1, unitPriceMinor: 100, comboId: null, comboGroupKey: null, isAddOn: false, status: 'ACTIVE', ...over });
const fact: ReorderFact = {
  published: true,
  nameEn: 'Shirt',
  nameBn: null,
  slug: 'shirt',
  sizes: [
    { id: 's', label: 'S' },
    { id: 'm', label: 'M' },
    { id: 'l', label: 'L' },
  ],
  variants: [
    { id: 'v1', colourId: 'sky', sizeId: 'm', priceMinor: 120, sellable: 0 },
    { id: 'v2', colourId: 'sky', sizeId: 'l', priceMinor: 120, sellable: 3 },
    { id: 'v3', colourId: 'sky', sizeId: 's', priceMinor: 120, sellable: 1 },
    { id: 'v4', colourId: 'navy', sizeId: 'm', priceMinor: 120, sellable: 5 },
  ],
};

describe('PR 622 · Buy again (pure)', () => {
  it('add-ons, free gifts and lines taken off are not copied; the shop\'s sets are grouped, built sets come back as pieces', () => {
    const p = reorderParts([
      item({ id: 'a' }),
      item({ id: 'b', isAddOn: true }),
      item({ id: 'c', unitPriceMinor: 0 }),
      item({ id: 'd', status: 'REMOVED' }),
      item({ id: 'e', comboId: 'k', comboGroupKey: 'g1' }),
      item({ id: 'f', comboId: 'k', comboGroupKey: 'g1' }),
      item({ id: 'g', comboId: null, comboGroupKey: 'built' }),
    ]);
    expect(p.loose.map((i) => i.id)).toEqual(['a', 'g']);
    expect(p.sets).toEqual([{ comboId: 'k', groupKey: 'g1', pieces: [expect.objectContaining({ id: 'e' }), expect.objectContaining({ id: 'f' })] }]);
  });

  it('never another size or colour: sold out names the sizes of that colour in stock, in size order; fewer when fewer are left', () => {
    expect(reorderVerdict(item({}), fact)).toEqual({ kind: 'soldOut', inStock: ['S', 'L'] });
    expect(reorderVerdict(item({ variantId: 'v2', quantity: 5 }), fact)).toEqual({ kind: 'add', variantId: 'v2', quantity: 3 });
    expect(reorderVerdict(item({ variantId: 'gone' }), fact)).toEqual({ kind: 'gone' });
    expect(reorderVerdict(item({ variantId: 'v2' }), { ...fact, published: false })).toEqual({ kind: 'gone' });
    expect(reorderVerdict(item({ variantId: 'v2' }), undefined)).toEqual({ kind: 'gone' });
    expect(reorderVerdict(item({ variantId: null }), fact)).toEqual({ kind: 'gone' });
  });

  it('off as it ships; offered only on the chosen states, never on a draft', () => {
    const d = registry['account.reorder'].default;
    expect(d.enabled).toBe(false);
    expect(d.states).toEqual(['DELIVERED']);
    expect(reorderOffered(d, 'DELIVERED')).toBe(false);
    expect(reorderOffered({ ...d, enabled: true }, 'DELIVERED')).toBe(true);
    expect(reorderOffered({ ...d, enabled: true }, 'IN_TRANSIT')).toBe(false);
    expect(reorderOffered({ enabled: true, states: ['DRAFT'] }, 'DRAFT')).toBe(false);
    expect(accountReorderSchema.safeParse({ ...d, states: ['DRAFT'] }).success).toBe(false);
    expect(accountReorderSchema.safeParse({ ...d, states: [] }).success).toBe(false);
    expect(accountReorderSchema.safeParse({ ...d, words: { ...d.words, button: { en: '', bn: 'x' } } }).success).toBe(false);
  });
});
