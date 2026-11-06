// PR 40 follow-up — which addresses the proxy answers "page not found" for before any page draws: never the home page,
// a folder of the shop's own, a product address under the owner's prefix or a "Coming soon" address; the list of the
// shop's own folders stays equal to the app's folders.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OWN_TOP_SEGMENTS, unknownAddress, unknownAddressNow } from './unknown-address';

const APP = join(__dirname, '..', '..', 'app');
/** The shop's own non-shop paths the proxy never sees (lib/shop/lang NOT_SHOP) or that are files, not pages. */
const NOT_PROXIED = ['admin', 'api', 'erp-api', 'status', 'media', 'sitemaps', 'llms.txt', 'robots.txt', 'sitemap.xml', 'favicon.ico'];

const folders = (dir: string) => readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
/** A folder that is part of the address (not a route group, not a dynamic segment). */
const own = (n: string) => !/^[([@]/.test(n);

describe('an address the shop has no page for (PR 40 follow-up)', () => {
  it('is any address outside the shop`s own folders, product addresses and "Coming soon" addresses', () => {
    for (const p of ['/zzz', '/wp-login.php', '/product/old-polo', '/.env', '/p', '/p/a/b/c', '/collectionz/polos', '/new-in']) expect(unknownAddress(p, '/p'), p).toBe(true);
    for (const p of ['/', '/p/polo', '/p/polo/navy', '/collections/polos', '/collections/a/b', '/journal/x', '/account/nope', '/help/careers', '/checkout', '/pay/abc', '/fresh-start'])
      expect(unknownAddress(p, '/p'), p).toBe(false);
  });

  it('follows the owner`s product prefix, a query and a trailing slash', () => {
    expect(unknownAddress('/shop/polo', '/shop')).toBe(false);
    expect(unknownAddress('/p/polo', '/shop')).toBe(true);
    expect(unknownAddress('/zzz/?x=1', '/p')).toBe(true);
    expect(unknownAddress('/?x=1', '/p')).toBe(false);
  });

  it('the shop`s own folders are exactly the app`s folders (a new page folder joins the list)', () => {
    const shop = [...folders(join(APP, '(shop)', '(store)')), ...folders(join(APP, '(shop)', '(checkout)'))].filter(own);
    const top = folders(APP).filter(own).filter((n) => !NOT_PROXIED.includes(n));
    expect([...new Set([...shop, ...top])].sort()).toEqual([...OWN_TOP_SEGMENTS].sort());
  });

  it('without the settings (no database) the proxy marks nothing and the page decides', async () => {
    const was = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(await unknownAddressNow(1, '/zzz')).toBe(false);
    } finally {
      if (was !== undefined) process.env.DATABASE_URL = was;
    }
  });
});
