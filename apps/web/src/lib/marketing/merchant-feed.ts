// S13 · PR 589 (register "Merchant Center feed + Bangladesh test (with Tirondaj) — feed from the catalogue, brand EXTAS,
// BDT; test Bangladesh as target country after go-live, result logged") — the Merchant Center feed on the database.
//
// - The products: every published product of a shown category (as the shop and the sitemap read them), the best first,
//   up to `ads.merchantFeed.maxItems`; sold-out ones only while `outOfStock`. Each with its feed title (else its name),
//   its English description, its page, its main front photo (the largest rendered size), the cheapest live variant's
//   price (the card's price), its stock, its brand (else the shop's name, `store.name`) and its category.
// - No struck price is sent yet: the feed's price is the price the customer pays, as on the page.
// - /feeds/merchant.xml serves it while on and on the shop's own domain; Merchant Center fetches it on its own schedule
//   (no key, nothing sent from the shop, no ad spend). Marketing › Merchant feed shows the address, the counts, why a
//   product is left out, the first items and the card (`marketing.campaigns.read`; the card `marketing.campaigns.write`).
// - The Bangladesh test itself (target country in Merchant Center after go-live, the result written down) is the
//   owner's step in Merchant Center: the page's guide walks through it.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { imageSources } from '@extas/media';
import { merchantFeedSchema, storeTarget, type MerchantFeedSettings } from '@extas/settings';
import { body as readBody, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { JournalError, answer, versionOf, type JournalWho } from '../journal/journal';
import { issuesOf } from '../journal/model';
import { productPath } from '../shop/home-model';
import { absolute } from '../shop/structured-data';
import { feedItems, reasonsOf, type FeedItem, type FeedProduct, type FeedReason } from './merchant-feed-model';

const S = MOTHER_STORE_ID;
const KEY = 'ads.merchantFeed';
export const FEED_PATH = '/feeds/merchant.xml';
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
/** How many items the admin page shows as a sample. */
const SAMPLE = 20; // hardcode-ok: a list length, not a business number

/** The feed's products, ready for the model (links and photos absolute against `origin`). */
export async function feedProducts(db: Db, resolver: Resolver, origin: URL | string, storeId: number = S): Promise<{ set: MerchantFeedSettings; currency: string; storeName: string; products: FeedProduct[] }> {
  const [set, currency, storeName, prefix] = await Promise.all([resolver.value(KEY, { storeId }), resolver.value('store.currency', { storeId }), resolver.value('store.name', { storeId }), resolver.value('naming.productPathPrefix', { storeId })]);
  const rows = await db.product.findMany({
    where: { storeId, status: 'PUBLISHED', archivedAt: null, category: { isVisible: true, archivedAt: null }, ...(set.outOfStock ? {} : { inStock: true }) },
    orderBy: [{ sortRank: 'desc' }, { publishedAt: 'desc' }, { slug: 'asc' }],
    take: set.maxItems,
    select: {
      id: true,
      slug: true,
      nameEn: true,
      feedTitle: true,
      descriptionEn: true,
      inStock: true,
      brand: { select: { name: true } },
      category: { select: { nameEn: true } },
      variants: { where: { archivedAt: null, active: true, priceMinor: { not: null } }, orderBy: { priceMinor: 'asc' }, take: 1, select: { priceMinor: true } },
      media: { where: { archivedAt: null, role: 'FRONT' }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { assetId: true } },
    },
  });
  const assetIds = [...new Set(rows.flatMap((p) => p.media.map((m) => m.assetId)))];
  const photos = assetIds.length ? await imageSources({ db, settings: resolver }, storeId, assetIds) : new Map();
  const shop = typeof storeName === 'string' ? storeName.trim() : '';
  const products = rows.map((p): FeedProduct => {
    const img = p.media[0] ? photos.get(p.media[0].assetId) : undefined;
    const widest = img?.variants.length ? [...img.variants].sort((a, b) => b.width - a.width)[0]! : null;
    return {
      id: p.id,
      title: (p.feedTitle ?? '').trim() || p.nameEn,
      description: p.descriptionEn,
      link: absolute(origin, productPath(prefix, p.slug)),
      image: widest ? absolute(origin, widest.url) : null,
      priceMinor: p.variants[0]?.priceMinor ?? null,
      wasMinor: null,
      inStock: p.inStock,
      brand: p.brand?.name ?? shop,
      category: p.category?.nameEn ?? null,
    };
  });
  return { set, currency, storeName: shop, products };
}

export interface FeedScreen {
  /** The feed's address on the shop's own domain, or null while no domain is known. */
  url: string | null;
  total: number;
  inFeed: number;
  left: Record<FeedReason, number>;
  /** The first products with what keeps each out (empty: in the feed). */
  sample: { id: string; title: string; price: string | null; availability: FeedItem['availability']; reasons: FeedReason[] }[];
  card: { key: string; value: MerchantFeedSettings; version: string };
}

/** Marketing › Merchant feed: the address, the counts, why products are left out, a sample and the card. */
export async function feedScreen(db: Db, resolver: Resolver, origin: URL | null, storeId: number = S): Promise<FeedScreen> {
  const base = origin ?? 'https://shop.invalid';
  const { set, currency, products } = await feedProducts(db, resolver, base, storeId);
  const { items, left } = feedItems(products, currency, set.outOfStock);
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    url: origin ? absolute(origin, FEED_PATH) : null,
    total: products.length,
    inFeed: items.length,
    left,
    sample: products.slice(0, SAMPLE).map((p) => ({ id: p.id, title: p.title, price: byId.get(p.id)?.salePrice ?? byId.get(p.id)?.price ?? null, availability: p.inStock ? 'in_stock' : 'out_of_stock', reasons: reasonsOf(p, set.outOfStock) })),
    card: { key: KEY, value: set, version: versionOf(set) },
  };
}

/** The card (`marketing.campaigns.write`; audited): the Lumen card's {key, on, values}. */
export async function saveFeedSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  if (!(await can(db, who.actor, 'marketing.campaigns.write', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['marketing.campaigns.write']);
  const before = await resolver.value(KEY, { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown };
  if (o.key !== KEY || typeof o.on !== 'boolean') throw new JournalError('INVALID_INPUT', 400, ['key']);
  const values = { ...(o.values && typeof o.values === 'object' ? (o.values as Record<string, unknown>) : {}) };
  // the card's choice "keep / leave out" sold-out products arrives as its option's value
  if (values.outOfStock === 'on' || values.outOfStock === 'off') values.outOfStock = values.outOfStock === 'on';
  const ok = merchantFeedSchema.safeParse({ ...before, ...values, on: o.on });
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Merchant feed' });
  await audit(db, who.actor, { storeId, action: 'ads.merchantFeed.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/** /api/admin/marketing/merchant-feed — GET the page (`marketing.campaigns.read`); PUT the card. */
export async function feedHandler(request: Request, deps: AdminDeps | null, origin: URL | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    if (method === 'PUT') await saveFeedSettings(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await readBody(request));
    const screen = await feedScreen(deps!.db, deps!.resolver, origin);
    return json({ ok: true, screen, cards: { [screen.card.key]: screen.card } });
  } catch (e) {
    return answer(e);
  }
}
