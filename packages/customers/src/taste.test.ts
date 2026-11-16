// PR 906 — the pure figures of a customer's taste (sizes, favourite categories, MRP value, discount, influencer code).
import { describe, expect, it } from 'vitest';
import { tasteOf } from './taste';

const at = (d: number) => new Date(Date.UTC(2026, 0, d));
const orders = [
  { id: 'o1', number: 'E-1', placedAt: at(2), subtotalMinor: 3000, discountMinor: 0, couponCode: null },
  { id: 'o2', number: 'E-2', placedAt: at(5), subtotalMinor: 1800, discountMinor: 200, couponCode: 'RIYA10' },
];
const items = [
  { orderId: 'o1', productId: 'p1', sizeLabel: 'L', quantity: 2, unitPriceMinor: 1500, compareAtMinor: 2000 },
  { orderId: 'o2', productId: 'p1', sizeLabel: 'L', quantity: 1, unitPriceMinor: 1000, compareAtMinor: null },
  { orderId: 'o2', productId: 'p2', sizeLabel: '32', quantity: 1, unitPriceMinor: 800, compareAtMinor: null },
  { orderId: 'o2', productId: 'p1', sizeLabel: 'XL', quantity: 1, unitPriceMinor: 0, compareAtMinor: null },
];
const cat = new Map<string, string | null>([['p1', 'c1'], ['p2', 'c2']]);
const names = new Map([['c1', { nameEn: 'Shirts', nameBn: null }], ['c2', { nameEn: 'Pants', nameBn: 'প্যান্ট' }]]);

describe('tasteOf', () => {
  it('counts pieces, MRP value and the discount received', () => {
    const t = tasteOf(orders, items, cat, names, new Map());
    expect(t.pieces).toBe(5);
    expect(t.mrpMinor).toBe(2000 * 2 + 1000 + 800 + 0);
    expect(t.discountMinor).toBe(5800 - 4800 + 200); // MRP less what was paid for the goods, plus the order discounts
  });
  it('gives the usual size per category, always or mostly, and the favourites by pieces', () => {
    const t = tasteOf(orders, items, cat, names, new Map());
    expect(t.usual.find((s) => s.categoryId === 'c1')).toMatchObject({ size: 'L', always: false, pieces: 4 });
    expect(t.usual.find((s) => s.categoryId === 'c2')).toMatchObject({ size: '32', always: true });
    expect(t.categories.map((c) => c.nameEn)).toEqual(['Shirts', 'Pants']);
  });
  it('finds the first order that used a partner code, ignoring case', () => {
    const t = tasteOf(orders, items, cat, names, new Map([['riya10', { name: 'Riya', platform: 'INSTAGRAM' }]]));
    expect(t.influencer).toEqual({ code: 'RIYA10', name: 'Riya', platform: 'INSTAGRAM', orderNumber: 'E-2' });
    expect(tasteOf(orders, items, cat, names, new Map()).influencer).toBeNull();
  });
  it('is empty without orders', () => {
    expect(tasteOf([], [], new Map(), new Map(), new Map())).toMatchObject({ pieces: 0, mrpMinor: 0, discountMinor: 0, usual: [], categories: [], influencer: null });
  });
});
