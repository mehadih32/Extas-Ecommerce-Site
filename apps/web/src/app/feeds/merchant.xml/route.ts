// S13 · PR 589 — /feeds/merchant.xml, the product feed Google Merchant Center fetches (lib/marketing/merchant-feed.ts):
// answered only while `ads.merchantFeed` is on and on the shop's own domain (as robots.txt); otherwise "not found".
// Everything in it is what the shop already shows. Public, read-only, nothing sent anywhere.
// PR 589 follow-up: one item per size and colour while `ads.merchantFeed.variants` is on.
import { getPrisma } from '@extas/db/client';
import { feedProducts } from '@/lib/marketing/merchant-feed';
import { feedItems, feedXml } from '@/lib/marketing/merchant-feed-model';
import { siteAddress } from '@/lib/seo/site';
import { settingsResolver } from '@/lib/settings';
import { shopStoreId } from '@/lib/shop/store-id';

export const dynamic = 'force-dynamic';

const XML = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=900', 'x-robots-tag': 'noindex' };
const NONE = new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(): Promise<Response> {
  const resolver = settingsResolver();
  if (!process.env.DATABASE_URL || !resolver) return NONE.clone();
  const storeId = shopStoreId();
  try {
    const [set, site] = await Promise.all([resolver.value('ads.merchantFeed', { storeId }), siteAddress(storeId)]);
    if (!set.on || !site.onPrimary || !site.origin) return NONE.clone();
    const { currency, storeName, products } = await feedProducts(getPrisma(), resolver, site.origin, storeId);
    const { items } = feedItems(products, currency, set.outOfStock, set.variants);
    return new Response(feedXml({ title: storeName || site.origin.host, link: site.origin.toString(), country: set.country }, items), { headers: XML });
  } catch {
    return NONE.clone();
  }
}
