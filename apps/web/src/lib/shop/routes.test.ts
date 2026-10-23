// CN-010 — the shop pages still to come show "Coming soon" inside the shell; anything else is "page not found".
import { describe, expect, it } from 'vitest';
import { comingSoon, ROUTES } from './routes';

describe('coming-soon pages (CN-010)', () => {
  it('every page a later PR builds is coming, and every link the shell carries lands somewhere', () => {
    // ~~ROUTES.bag~~ PR 107 built the bag
    // ~~ROUTES.wishlist~~ PR 71 built the wishlist; ~~ROUTES.help('faq')~~ PR 75 built the help pages (Ways to pay is still to come)
    // ~~ROUTES.search~~ PR 73 built the results page
    // ~~ROUTES.account, ROUTES.login, ROUTES.orders~~ PR 130 / 131 built the login and My account
    // ~~ROUTES.order('T-1001')~~ PR 134 built the order page
    // ~~ROUTES.combos~~ PR 103 built the sets landing page; a rule's own list and the set builder are still to come
    for (const p of ['/combos/sample-polo-pairs', ROUTES.buildSet, ROUTES.journal, ROUTES.help('payment')])
      expect(comingSoon(p, '/p'), p).not.toBeNull();
    // ~~expect(comingSoon('/collections/polos', '/p')).toBe('collections');~~ PR 45 built the category pages
    for (const p of [ROUTES.newIn, ROUTES.category('polos')]) expect(comingSoon(p, '/p'), p).toBeNull();
    // ~~expect(comingSoon('/account/orders/T-1001/', '/p')).toBe('account');~~ PR 134
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

  it('PR 91 / 103: the combo page is its own route, and the sets landing page is built inside the coming /combos', () => {
    expect(ROUTES.combo('sample polo~set')).toBe('/combo/sample%20polo~set');
    expect(comingSoon(ROUTES.combos, '/p')).toBeNull();
    expect(comingSoon(`${ROUTES.combos}/`, '/p')).toBeNull();
    expect(comingSoon(ROUTES.combo('sample-polo-chino-set'), '/p')).toBeNull();
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
    // ~~expect(comingSoon(ROUTES.orders, '/p')).toBe('account');~~
    // ~~expect(comingSoon(ROUTES.account, '/p')).toBe('account');~~ PR 131 built My account
  });

  it('PR 131 / 134: My account, its sections and the page of one order are built', () => {
    for (const p of [ROUTES.account, ROUTES.orders, `${ROUTES.orders}/`, ROUTES.login, '/account/profile', '/account/wallet', '/account/anything']) expect(comingSoon(p, '/p'), p).toBeNull();
    // ~~expect(comingSoon(ROUTES.order('T-1001'), '/p')).toBe('account');~~ PR 134 built it
    expect(comingSoon(ROUTES.order('T-1001'), '/p')).toBeNull();
    // PR 136: its invoice, and the invoice as a file
    expect(ROUTES.invoice('EX-1001')).toBe('/account/orders/EX-1001/invoice');
    expect(ROUTES.invoiceFile('EX 1/2')).toBe('/account/orders/EX%201%2F2/invoice/file');
    for (const p of [ROUTES.invoice('T-1001'), ROUTES.invoiceFile('T-1001')]) expect(comingSoon(p, '/p'), p).toBeNull();
  });
});
