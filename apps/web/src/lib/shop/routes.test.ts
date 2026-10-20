// CN-010 — the shop pages still to come show "Coming soon" inside the shell; anything else is "page not found".
import { describe, expect, it } from 'vitest';
import { comingSoon, ROUTES } from './routes';

describe('coming-soon pages (CN-010)', () => {
  it('every page a later PR builds is coming, and every link the shell carries lands somewhere', () => {
    for (const p of [ROUTES.bag, ROUTES.account, ROUTES.login, ROUTES.wishlist, ROUTES.orders, ROUTES.search, ROUTES.newIn, ROUTES.combos, ROUTES.buildSet, ROUTES.journal, ROUTES.help('faq'), ROUTES.category('polos')])
      expect(comingSoon(p, '/p'), p).not.toBeNull();
    expect(comingSoon('/collections/polos', '/p')).toBe('collections');
    expect(comingSoon('/account/orders/', '/p')).toBe('account');
  });

  it("the product page follows the owner's prefix", () => {
    expect(comingSoon('/p/classic-polo', '/p')).toBe('product');
    expect(comingSoon('/shop/classic-polo', '/shop')).toBe('product');
    expect(comingSoon('/p', '/p')).toBeNull();
    expect(comingSoon('/p/classic-polo', '/shop')).toBeNull();
  });

  it('an address the shop will never have is not coming', () => {
    for (const p of ['/nothing-here', '/bagx', '/search/deep', '/collectionsx', '/'] as const) expect(comingSoon(p, '/p'), p).toBeNull();
  });
});
