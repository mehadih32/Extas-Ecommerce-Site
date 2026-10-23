// PR 71 — the wishlist's pure pieces: the readable count cookie and what a POST may carry.
import { describe, expect, it } from 'vitest';
import { WISH_COUNT_COOKIE, wishCountCookie, wishCountOf, wishInputs } from './wish-model';

const A = '0199a3b2-1111-7000-8000-000000000001';
const B = '0199a3b2-1111-7000-8000-000000000002';
const V = '0199a3b2-1111-7000-8000-0000000000aa';

describe('the wishlist count cookie', () => {
  it('is readable by the page (never HttpOnly), Secure, Lax, kept as long as the visitor id', () => {
    const c = wishCountCookie(3, 30);
    expect(c).toBe(`${WISH_COUNT_COOKIE}=3; Path=/; Secure; SameSite=Lax; Max-Age=2592000`);
    expect(c).not.toContain('HttpOnly');
  });

  it('reads back from the page cookie, anything else is none', () => {
    expect(wishCountOf(`a=1; ${WISH_COUNT_COOKIE}=12; b=2`)).toBe(12);
    expect(wishCountOf(`${WISH_COUNT_COOKIE}=0`)).toBe(0);
    expect(wishCountOf(`${WISH_COUNT_COOKIE}=x`)).toBeNull();
    expect(wishCountOf('x_extas_wish_n=4')).toBeNull();
    expect(wishCountOf('')).toBeNull();
  });
});

describe('what the wishlist API takes', () => {
  it('ids and items, each product once, ids only, at most `max`', () => {
    expect(wishInputs({ ids: [A, A, 'nope', 7, B] }, 10)).toEqual([
      { productId: A, colourId: null, variantId: null },
      { productId: B, colourId: null, variantId: null },
    ]);
    expect(wishInputs({ items: [{ productId: A, variantId: V, colourId: 'x' }], ids: [A] }, 10)).toEqual([{ productId: A, colourId: null, variantId: V }]);
    expect(wishInputs({ ids: [A, B] }, 1)).toHaveLength(1);
    expect(wishInputs({ ids: 'A' }, 10)).toEqual([]);
    expect(wishInputs({}, 10)).toEqual([]);
  });
});
