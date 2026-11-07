// Follow-up 631 (PR 271–273): the bag a page draws is read for the signed-in customer, so the code box's members-only
// and own-invite checks see him (checkout already did); a guest's bag is read with no customer.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<Record<string, unknown>> = [];
let me: { customer: { id: string } } | null = null;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'extas_bag' ? { value: 'visitor-1' } : undefined) }) }));
vi.mock('../settings', () => ({ settingsResolver: () => ({ value: async () => null }), settingsTimeoutMs: () => 1_000, withTimeout: <T,>(p: Promise<T>) => p }));
vi.mock('@extas/db/client', () => ({ getPrisma: () => ({}) }));
vi.mock('./account', () => ({ signedIn: async () => me }));
vi.mock('@extas/cart', () => ({
  emptyBag: () => ({ empty: true }),
  findBag: async () => 'cart-1',
  bagView: async (_deps: unknown, input: Record<string, unknown>) => (calls.push(input), { cartId: input.cartId }),
}));
vi.mock('./bag-model', () => ({ BAG_COOKIE: 'extas_bag' }));

const { currentBag } = await import('./bag');

describe('follow-up 631: the bag knows the signed-in customer', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('passes the signed-in customer to the bag, and none for a guest', async () => {
    me = { customer: { id: 'cust-7' } };
    await currentBag({ storeId: 1, lang: 'en' });
    me = null;
    await currentBag({ storeId: 1, lang: 'bn' });
    expect(calls.map((c) => [c.cartId, c.customerId, c.lang])).toEqual([
      ['cart-1', 'cust-7', 'en'],
      ['cart-1', null, 'bn'],
    ]);
  });
});
