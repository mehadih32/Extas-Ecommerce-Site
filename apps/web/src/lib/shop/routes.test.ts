// CN-010 — the shop pages still to come show "Coming soon" inside the shell; anything else is "page not found".
import { describe, expect, it } from 'vitest';
import { comingSoon, ROUTES } from './routes';

describe('coming-soon pages (CN-010)', () => {
  it('every page a later PR builds is coming, and every link the shell carries lands somewhere', () => {
    // ~~ROUTES.bag~~ PR 107 built the bag
    // ~~ROUTES.wishlist~~ PR 71 built the wishlist; ~~ROUTES.help('faq')~~ PR 75 built the help pages (Ways to pay is still to come)
    // ~~ROUTES.search~~ PR 73 built the results page
    for (const p of [ROUTES.account, ROUTES.login, ROUTES.orders, ROUTES.combos, ROUTES.buildSet, ROUTES.journal, ROUTES.help('payment')])
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

  it('the search results page is built (PR 73): /search is no longer "coming soon"', () => {
    expect(comingSoon(ROUTES.search, '/p')).toBeNull();
  });

  it('a page that is built is not "coming soon" any more (PR 107: the bag)', () => {
    expect(comingSoon(ROUTES.bag, '/p')).toBeNull();
    expect(comingSoon(`${ROUTES.bag}/`, '/p')).toBeNull();
  });

  it('PR 71: the wishlist is built inside the coming account pages', () => {
    expect(comingSoon(ROUTES.wishlist, '/p')).toBeNull();
    expect(comingSoon(`${ROUTES.wishlist}/`, '/p')).toBeNull();
    expect(comingSoon(ROUTES.orders, '/p')).toBe('account');
    expect(comingSoon(ROUTES.account, '/p')).toBe('account');
  });
});
