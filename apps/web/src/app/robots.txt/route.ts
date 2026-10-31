// S11 · PR 229 — /robots.txt (lib/seo/robots): closed while the shop is closed to search engines or the request is not
// on the store's own domain; open, the admin, the API and a customer's pages stay out, AI robots as the owner says, and
// the sitemap's address. On the preview, Caddy answers /robots.txt itself (always closed).
import { readPageSettings } from '@/lib/shop/context';
import { shopStoreId } from '@/lib/shop/store-id';
import { robotsTxt } from '@/lib/seo/robots';
import { siteAddress } from '@/lib/seo/site';
import { SITEMAP_INDEX } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

const KEYS = ['seo.indexing', 'seo.robots', 'seo.sitemaps'] as const;

export async function GET(): Promise<Response> {
  const storeId = shopStoreId();
  const [set, site] = await Promise.all([readPageSettings(KEYS, storeId), siteAddress(storeId)]);
  const idx = set['seo.indexing'];
  const text = robotsTxt(set['seo.robots'], {
    open: idx.searchEngines && site.onPrimary,
    searchListed: idx.pages.search,
    sitemap: set['seo.sitemaps'].enabled && site.origin ? new URL(SITEMAP_INDEX, site.origin).toString() : null,
  });
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=300' } });
}
