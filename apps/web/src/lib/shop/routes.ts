// The storefront routing table (A1.4: one owner, the storefront lead; Blueprint C12.1 URL map). Every shop address the
// code links to is named here once; the menus and the footer carry their own addresses as settings (`shell.*`).
// ~~Pages that later PRs build (bag, account, search, collections …) are linked already: until they exist the address
// shows the shop's own "page not found" inside the shell, never a dead end.~~
// CN-010 (owner): a shop page that a later PR builds shows "Coming soon" inside the store shell until that PR lands
// (COMING_SOON below); the PR that builds a page adds its own route and takes its line out of the list. Only an
// address the shop will never have gets "page not found".
export const ROUTES = {
  home: '/',
  bag: '/bag',
  checkout: '/checkout',
  /** PR 125: a prepaid order's payment (the mock until the gateways of S07). */
  checkoutPay: (number: string) => `/checkout/pay/${encodeURIComponent(number)}`,
  /** PR 126: the thank-you page of an order. */
  thanks: (number: string) => `/checkout/thanks/${encodeURIComponent(number)}`,
  account: '/account',
  login: '/account/login',
  wishlist: '/account/wishlist',
  orders: '/account/orders',
  search: '/search',
  newIn: '/collections/new-in',
  combos: '/combos',
  buildSet: '/combos/build-your-own',
  journal: '/journal',
  help: (slug: string) => `/help/${slug}`,
  category: (slug: string) => `/collections/${slug}`,
} as const;

/** The product page's query word that opens it on one colour (demo `#/p/<id>?color=<key>`; the product page, PR 49). */
export const COLOUR_QUERY = 'color';

/**
 * The shop pages still to come, by the register PR that builds each (Blueprint E0 stage table). `deep`: the address
 * and everything under it. The product page's address starts with the owner's prefix (`naming.productPathPrefix`).
 */
export const COMING_SOON: ReadonlyArray<{ key: string; path: string; deep: boolean }> = [
  // ~~{ key: 'collections', path: '/collections', deep: true }, // category pages, PR 45~~ built: app/(shop)/(store)/collections/[slug]
  { key: 'search', path: '/search', deep: false },
  // ~~{ key: 'bag', path: '/bag', deep: false }~~ — built: PR 107 (the bag page)
  { key: 'account', path: '/account', deep: true },
  { key: 'combos', path: '/combos', deep: true },
  { key: 'journal', path: '/journal', deep: true },
  { key: 'help', path: '/help', deep: true },
];

/** Which coming page an address belongs to, or null (then it is not a shop page at all). */
export function comingSoon(path: string, productPrefix: string): string | null {
  const p = path.replace(/\/+$/, '') || '/';
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  // ~~the product page under the owner's prefix: 'product'~~ built: PR 49 (the catch-all route draws it, lib/shop/product-model productRoute)
  void productPrefix;
  for (const r of COMING_SOON) if (r.deep ? under(r.path) : p === r.path) return r.key;
  return null;
}
