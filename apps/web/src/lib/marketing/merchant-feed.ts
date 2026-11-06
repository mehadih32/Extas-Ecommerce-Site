// S13 · PR 589 (register "Merchant Center feed + Bangladesh test (with Tirondaj) — feed from the catalogue, brand EXTAS,
// BDT; test Bangladesh as target country after go-live, result logged") — the Merchant Center feed on the database.
//
// - The products: every published product of a shown category (as the shop and the sitemap read them), the best first,
//   up to `ads.merchantFeed.maxItems`; sold-out ones only while `outOfStock`. Each with its feed title (else its name),
//   its English description, its page, its main front photo (the largest rendered size), the cheapest live variant's
//   price (the card's price), its stock, its brand (else the shop's name, `store.name`) and its category.
// - PR 589 follow-up: while `variants` is on, each product also reads its live sizes and colours (a price set, not put
//   away): each one becomes its own item with its colour and size names, its price and stock, the photo of its colour
//   (else the product's main one) and the product page opened on it (`?color=<colour>&s=<size>`, as the shop's own links).
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
import { COLOUR_QUERY, SIZE_QUERY } from '../shop/routes';
import { absolute } from '../shop/structured-data';
import { feedItems, reasonsOf, type FeedItem, type FeedProduct, type FeedReason, type FeedVariant } from './merchant-feed-model';

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
  // PR 589 follow-up: each product's live sizes and colours, and the front photo of each colour
  const ids = rows.map((p) => p.id);
  const [sizes, colourPhotos] = set.variants && ids.length
    ? await Promise.all([
        db.productVariant.findMany({
          where: { storeId, productId: { in: ids }, archivedAt: null, active: true, priceMinor: { not: null } },
          orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
          select: { id: true, productId: true, priceMinor: true, inStock: true, colourId: true, colour: { select: { key: true, nameEn: true } }, size: { select: { key: true, label: true, sortOrder: true } } },
        }),
        db.productMedia.findMany({ where: { storeId, productId: { in: ids }, archivedAt: null, role: 'FRONT', colourId: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], select: { productId: true, colourId: true, assetId: true } }),
      ])
    : [[], []];
  const colourPhoto = new Map<string, string>();
  for (const m of colourPhotos) if (!colourPhoto.has(`${m.productId}:${m.colourId}`)) colourPhoto.set(`${m.productId}:${m.colourId}`, m.assetId);
  const assetIds = [...new Set([...rows.flatMap((p) => p.media.map((m) => m.assetId)), ...colourPhoto.values()])];
  const photos = assetIds.length ? await imageSources({ db, settings: resolver }, storeId, assetIds) : new Map();
  const photoUrl = (assetId: string | undefined) => {
    const img = assetId ? photos.get(assetId) : undefined;
    const widest = img?.variants.length ? [...img.variants].sort((a, b) => b.width - a.width)[0]! : null;
    return widest ? absolute(origin, widest.url) : null;
  };
  const byProduct = new Map<string, typeof sizes>();
  for (const v of sizes) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const shop = typeof storeName === 'string' ? storeName.trim() : '';
  const products = rows.map((p): FeedProduct => {
    const page = productPath(prefix, p.slug);
    const main = photoUrl(p.media[0]?.assetId);
    const own = byProduct.get(p.id) ?? [];
    // colour by colour (as the shop lists them), each colour's sizes in the size order
    const colourAt = new Map<string | null, number>();
    for (const v of own) if (!colourAt.has(v.colourId)) colourAt.set(v.colourId, colourAt.size);
    const variants = set.variants
      ? [...own]
          .sort((a, b) => colourAt.get(a.colourId)! - colourAt.get(b.colourId)! || (a.size?.sortOrder ?? 0) - (b.size?.sortOrder ?? 0))
          .map((v): FeedVariant => {
            const q = new URLSearchParams();
            if (v.colour) q.set(COLOUR_QUERY, v.colour.key);
            if (v.size) q.set(SIZE_QUERY, v.size.key);
            const query = q.toString();
            return {
              id: v.id,
              colour: v.colour?.nameEn ?? null,
              size: v.size?.label ?? null,
              link: absolute(origin, query ? `${page}?${query}` : page),
              image: (v.colourId ? photoUrl(colourPhoto.get(`${p.id}:${v.colourId}`)) : null) ?? main,
              priceMinor: v.priceMinor,
              inStock: v.inStock,
            };
          })
      : undefined;
    return {
      id: p.id,
      title: (p.feedTitle ?? '').trim() || p.nameEn,
      description: p.descriptionEn,
      link: absolute(origin, page),
      image: main,
      priceMinor: p.variants[0]?.priceMinor ?? null,
      wasMinor: null,
      inStock: p.inStock,
      brand: p.brand?.name ?? shop,
      category: p.category?.nameEn ?? null,
      ...(variants ? { variants } : {}),
    };
  });
  return { set, currency, storeName: shop, products };
}

export interface FeedScreen {
  /** The feed's address on the shop's own domain, or null while no domain is known. */
  url: string | null;
  total: number;
  /** Products in the feed. */
  inFeed: number;
  /** PR 589 follow-up: the feed's items (more than its products while each size and colour is its own item). */
  items: number;
  left: Record<FeedReason, number>;
  /** The first products with what keeps each out (empty: in the feed) and how many items each makes. */
  sample: { id: string; title: string; price: string | null; availability: FeedItem['availability']; reasons: FeedReason[]; items: number }[];
  card: { key: string; value: MerchantFeedSettings; version: string };
}

/** Marketing › Merchant feed: the address, the counts, why products are left out, a sample and the card. */
export async function feedScreen(db: Db, resolver: Resolver, origin: URL | null, storeId: number = S): Promise<FeedScreen> {
  const base = origin ?? 'https://shop.invalid';
  const { set, currency, products } = await feedProducts(db, resolver, base, storeId);
  const { items, left } = feedItems(products, currency, set.outOfStock, set.variants);
  // a product's items: itself, or (PR 589 follow-up) its sizes and colours
  const byProduct = new Map<string, FeedItem[]>();
  for (const i of items) byProduct.set(i.groupId ?? i.id, [...(byProduct.get(i.groupId ?? i.id) ?? []), i]);
  return {
    url: origin ? absolute(origin, FEED_PATH) : null,
    total: products.length,
    inFeed: byProduct.size,
    items: items.length,
    left,
    sample: products.slice(0, SAMPLE).map((p) => {
      const first = byProduct.get(p.id)?.[0];
      return { id: p.id, title: p.title, price: first?.salePrice ?? first?.price ?? null, availability: p.inStock ? 'in_stock' : 'out_of_stock', reasons: reasonsOf(p, set.outOfStock), items: byProduct.get(p.id)?.length ?? 0 };
    }),
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
  // PR 589 follow-up: "one item per product / per size and colour" likewise
  if (values.variants === 'on' || values.variants === 'off') values.variants = values.variants === 'on';
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
