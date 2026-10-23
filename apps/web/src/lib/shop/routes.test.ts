// CN-010 — the shop pages still to come show "Coming soon" inside the shell; anything else is "page not found".
import { describe, expect, it } from 'vitest';
import { comingSoon, ROUTES } from './routes';

describe('coming-soon pages (CN-010)', () => {
  it('every page a later PR builds is coming, and every link the shell carries lands somewhere', () => {
    // ~~ROUTES.bag~~ PR 107 built the bag
    for (const p of [ROUTES.account, ROUTES.login, ROUTES.wishlist, ROUTES.orders, ROUTES.search, ROUTES.combos, ROUTES.buildSet, ROUTES.journal, ROUTES.help('faq')])
      expect(comingSoon(p, '/p'), p).not.toBeNull();
    // ~~expect(comingSoon('/collections/polos', '/p')).toBe('collections');~~ PR 45 built the category pages
    for (const p of [ROUTES.newIn, ROUTES.category('polos')]) expect(comingSoon(p, '/p'), p).toBeNull();
    expect(comingSoon('/account/orders/', '/p')).toBe('account');
  });

  it('the product page is built (PR 49): its addresses are no longer "coming soon"', () => {
    // ~~expect(comingSoon('/p/classic-polo', '/p')).toBe('product');~~ the catch-all route draws the product page
    expect(comingSoon('/p/classic-polo', '/p')).toBeNull();
    expect(comingSoon('/shop/classic-polo', '/shop')).toBeNull();
    expect(comingSoon('/p', '/p')).toBeNull();
  });

  it('an address the shop will never have is not coming', () => {
    for (const p of ['/nothing-here', '/bagx', '/search/deep', '/collectionsx', '/'] as const) expect(comingSoon(p, '/p'), p).toBeNull();
  });

  it('a page that is built is not "coming soon" any more (PR 107: the bag)', () => {
    expect(comingSoon(ROUTES.bag, '/p')).toBeNull();
    expect(comingSoon(`${ROUTES.bag}/`, '/p')).toBeNull();
  });
});
