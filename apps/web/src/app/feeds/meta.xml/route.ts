// S28 · PR 696 — /feeds/meta.xml, the catalogue feed Meta (Facebook and Instagram) fetches: answered only while
// `marketing.metaFeed` is on and on the shop's own domain, as /feeds/merchant.xml; otherwise "not found". The products,
// photos, prices, sizes and colours are the Google feed's (lib/marketing/merchant-feed.ts) and follow its card.
import { getPrisma } from '@extas/db/client';
import { feedProducts } from '@/lib/marketing/merchant-feed';
import { feedItems } from '@/lib/marketing/merchant-feed-model';
import { metaFeedXml } from '@/lib/marketing/meta-feed-model';
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
    const [meta, site] = await Promise.all([resolver.value('marketing.metaFeed', { storeId }), siteAddress(storeId)]);
    if (!meta.on || !site.onPrimary || !site.origin) return NONE.clone();
    const { set, currency, storeName, products } = await feedProducts(getPrisma(), resolver, site.origin, storeId);
    const { items } = feedItems(products, currency, set.outOfStock, set.variants, { gender: set.gender, ageGroup: set.ageGroup });
    return new Response(metaFeedXml({ title: storeName || site.origin.host, link: site.origin.toString() }, items), { headers: XML });
  } catch {
    return NONE.clone();
  }
}
