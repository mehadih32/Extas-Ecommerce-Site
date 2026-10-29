// PR 41 / 43 / 45 / 49 — what the shop's pages read from the catalogue: published products as cards (name, price,
// colours, the photo or the drawing, the badge), the category tiles, the hero's pictures. Read-only and public: no permission, nothing a customer
// may not see. Every price is the shop's own variant price; a struck "was" price only ever comes from the honesty rule
// of PR 38 (`wasPriceFor`): with no source chosen by the owner, there is none anywhere. Without a database (CI,
// `next build`) or when it is slow, the lists are empty and the page still draws.
import { getPrisma, type Prisma } from '@extas/db/client';
import { wasPriceFor, type WasPriceSource } from '@extas/catalogue';
import { imageSources, type ImageSource } from '@extas/media';
import type { HomeFlashSale } from '@extas/settings';
import { cachedCategoryPage } from '../cache';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import type { SizeMeta } from './category-filter';
import type { CatItem } from './category-model';
import type { ShopLang } from './lang';

export interface ShopColour {
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
}

export interface ShopCard {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  /** The garment type key (the drawing), from the product's category. */
  garment: string | null;
  categorySlug: string | null;
  /** The fit line ("Regular fit"), from the product's page facts. */
  fit: string | null;
  priceMinor: number | null;
  /** The struck price, only when the honesty rule allows one (PR 38). */
  wasMinor: number | null;
  colours: ShopColour[];
  /** The first live tag's words ("New", "Bestseller"), drawn as the card's badge. */
  badge: string | null;
  /** The front photo of each colour (by colour key), or of the product ('*'). */
  photos: Record<string, ImageSource>;
  inStock: boolean;
  sortRank: number;
}

export const productName = (p: Pick<ShopCard, 'nameEn' | 'nameBn'>, lang: ShopLang) => (lang === 'bn' && p.nameBn) || p.nameEn;
export const colourName = (c: Pick<ShopColour, 'nameEn' | 'nameBn'>, lang: ShopLang) => (lang === 'bn' && c.nameBn) || c.nameEn;

/** The photo for a colour: that colour's front photo, else the product's own, else none (the drawing shows). */
export function photoFor(card: Pick<ShopCard, 'photos'>, colourKey: string | undefined): ImageSource | null {
  return (colourKey ? card.photos[colourKey] : undefined) ?? card.photos['*'] ?? null;
}

const live = { status: 'PUBLISHED', archivedAt: null } as const;

const cardSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameBn: true,
  pdpBlocks: true,
  sortRank: true,
  inStock: true,
  categoryId: true,
  wasPriceSource: true,
  brand: { select: { isOwnLabel: true } },
  category: { select: { slug: true, garmentType: { select: { key: true } } } },
  colours: {
    where: { archivedAt: null, colour: { archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    select: { colour: { select: { id: true, key: true, nameEn: true, nameBn: true, hex: true } } },
  },
  variants: { where: { archivedAt: null, active: true }, select: { id: true, colourId: true, priceMinor: true, compareAtMinor: true } },
  media: {
    where: { archivedAt: null, role: 'FRONT' },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { assetId: true, colourId: true },
  },
} satisfies Prisma.ProductSelect;

type Row = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;
const rowsOf = (args: Omit<Prisma.ProductFindManyArgs, 'select' | 'include'>): Promise<Row[]> => getPrisma().product.findMany({ ...args, select: cardSelect });

/** The fit words a product's page facts carry. */
function fitOf(blocks: unknown): string | null {
  const f = blocks && typeof blocks === 'object' ? (blocks as Record<string, unknown>).fit : null;
  return typeof f === 'string' && f.trim() ? f.trim() : null;
}

export interface PriceRules {
  store: WasPriceSource | null;
  historyDays: number;
  mrpOwnLabel: boolean;
  /** Each category's own source and parent, for the product → category → parents → store chain. */
  cats: Map<string, { source: WasPriceSource | null; parentId: string | null }>;
}

export async function priceRules(storeId: number): Promise<PriceRules> {
  const r = settingsResolver();
  const at = { storeId };
  const [store, historyDays, mrpOwnLabel] = r
    ? await Promise.all([r.value('catalogue.wasPrice.defaultSource', at), r.value('catalogue.wasPrice.historyDays', at), r.value('catalogue.wasPrice.mrpOwnLabel', at)])
    : [null, 0, false];
  const rows = await getPrisma().category.findMany({ where: { storeId }, select: { id: true, parentId: true, wasPriceSource: true } });
  return { store: store ?? null, historyDays, mrpOwnLabel, cats: new Map(rows.map((c) => [c.id, { source: c.wasPriceSource, parentId: c.parentId }])) };
}

export function sourceOf(rules: PriceRules, product: { wasPriceSource: WasPriceSource | null; categoryId: string | null }): WasPriceSource | null {
  if (product.wasPriceSource) return product.wasPriceSource;
  for (let id = product.categoryId, guard = 0; id && guard < 64; guard++) {
    const c = rules.cats.get(id);
    if (!c) break;
    if (c.source) return c.source;
    id = c.parentId;
  }
  return rules.store;
}

/** The front photo of each colour (and of the product, '*'), per product: one look-up of every asset at once. */
async function photoMap(storeId: number, rows: readonly Row[]): Promise<Map<string, Record<string, ImageSource>>> {
  const out = new Map<string, Record<string, ImageSource>>();
  const assetIds = [...new Set(rows.flatMap((p) => p.media.map((m) => m.assetId)))];
  const resolver = settingsResolver();
  const photos = assetIds.length && resolver ? await imageSources({ db: getPrisma(), settings: resolver }, storeId, assetIds) : new Map<string, ImageSource>();
  for (const p of rows) {
    const colourKey = new Map(p.colours.map((c) => [c.colour.id, c.colour.key]));
    const shots: Record<string, ImageSource> = {};
    for (const m of p.media) {
      const img = photos.get(m.assetId);
      if (!img) continue;
      const key = m.colourId ? colourKey.get(m.colourId) : '*';
      if (key && !shots[key]) shots[key] = img;
    }
    out.set(p.id, shots);
  }
  return out;
}

/**
 * PR 44 · a test server's flash-sale trial only (lib/shop/flash.ts, EXTAS_SHOP_TEST_PAGES=1): the store-wide "was" price
 * choice drawn as if the owner had picked it, so the sample catalogue's compare-at prices show through the same PR 38
 * rule. Never on the live shop; nothing is written.
 */
export type PriceRuleTrial = Pick<PriceRules, 'store' | 'mrpOwnLabel'>;

/** Rows as cards. `withPhotos: false` leaves the photos out (PR 45: a long category reads them for the page shown only). */
async function toCards(storeId: number, rows: Row[], withPhotos = true, trial?: PriceRuleTrial): Promise<ShopCard[]> {
  if (!rows.length) return [];
  const prisma = getPrisma();
  const rules = { ...(await priceRules(storeId)), ...(trial ?? {}) };
  const now = new Date();
  // the cheapest live variant is the card's price; its struck price follows the rule
  const cheapest = new Map(
    rows.map((p) => {
      const priced = p.variants.filter((v) => v.priceMinor != null).sort((a, b) => a.priceMinor! - b.priceMinor!);
      return [p.id, priced[0] ?? null] as const;
    }),
  );
  const needHistory = rows.filter((p) => sourceOf(rules, p) === 'PRICE_HISTORY').map((p) => cheapest.get(p.id)?.id).filter((x): x is string => !!x);
  const history = needHistory.length
    ? await prisma.priceHistory.findMany({ where: { storeId, variantId: { in: needHistory } }, select: { variantId: true, priceMinor: true, effectiveFrom: true } })
    : [];
  const tags = await prisma.productTag.findMany({
    where: { storeId, archivedAt: null, productId: { in: rows.map((p) => p.id) }, tag: { archivedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: { productId: true, tag: { select: { name: true } } },
  });
  const photos = withPhotos ? await photoMap(storeId, rows) : new Map<string, Record<string, ImageSource>>();
  return rows.map((p) => {
    const v = cheapest.get(p.id) ?? null;
    const was = v
      ? wasPriceFor({
          source: sourceOf(rules, p),
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor,
          brand: p.brand,
          mrpOwnLabel: rules.mrpOwnLabel,
          history: history.filter((h) => h.variantId === v.id),
          historyDays: rules.historyDays,
          now,
        }).wasMinor
      : null;
    return {
      id: p.id,
      slug: p.slug,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      garment: p.category?.garmentType?.key ?? null,
      categorySlug: p.category?.slug ?? null,
      fit: fitOf(p.pdpBlocks),
      priceMinor: v?.priceMinor ?? null,
      wasMinor: was,
      colours: p.colours.map((c) => ({ key: c.colour.key, nameEn: c.colour.nameEn, nameBn: c.colour.nameBn, hex: c.colour.hex })),
      badge: tags.find((t) => t.productId === p.id)?.tag.name ?? null,
      photos: photos.get(p.id) ?? {},
      inStock: p.inStock,
      sortRank: p.sortRank,
    };
  });
}

async function guarded<T>(what: string, empty: T, run: () => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) return empty;
  try {
    return await withTimeout(run(), settingsTimeoutMs() * 2);
  } catch (e) {
    console.warn(`shop: ${what} unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return empty;
  }
}

/** The newest published products of visible categories (PR 41 "New in"). */
export function newestCards(storeId: number, count: number, order: 'newest' | 'rank'): Promise<ShopCard[]> {
  return guarded('new in', [], async () => {
    const rows = await rowsOf({
      where: { storeId, ...live, category: { isVisible: true, archivedAt: null } },
      orderBy: order === 'newest' ? [{ publishedAt: 'desc' }, { sortRank: 'desc' }, { nameEn: 'asc' }] : [{ sortRank: 'desc' }, { nameEn: 'asc' }],
      take: count,
    });
    return toCards(storeId, rows);
  });
}

/** For each category slug, its first product in the owner's order (the tile's picture), searching its sub-categories too. */
export function categoryLeads(storeId: number, slugs: readonly string[]): Promise<Record<string, ShopCard>> {
  return guarded('category tiles', {}, async () => {
    if (!slugs.length) return {};
    const listings = await getPrisma().categoryProduct.findMany({
      where: {
        storeId,
        isVisible: true,
        product: live,
        category: { archivedAt: null, OR: [{ slug: { in: [...slugs] } }, { parent: { slug: { in: [...slugs] } } }] },
      },
      orderBy: [{ pinned: 'desc' }, { sortRank: 'desc' }],
      select: { productId: true, category: { select: { slug: true, parent: { select: { slug: true } } } } },
    });
    const lead = new Map<string, string>();
    for (const l of listings) {
      const top = slugs.includes(l.category.slug) ? l.category.slug : (l.category.parent?.slug ?? '');
      if (top && !lead.has(top)) lead.set(top, l.productId);
    }
    const cards = await toCards(storeId, await rowsOf({ where: { id: { in: [...new Set(lead.values())] } } }));
    const byId = new Map(cards.map((c) => [c.id, c]));
    return Object.fromEntries([...lead].flatMap(([slug, id]) => (byId.has(id) ? [[slug, byId.get(id)!]] : [])));
  });
}

/**
 * PR 43 · the hero's products, one list per category slug (in the order given): each category's first products in the
 * owner's order (pinned first), its sub-categories included, at most `perCategory` each. A product listed in two
 * categories counts for the first.
 */
export function heroCategoryCards(storeId: number, slugs: readonly string[], perCategory: number, inStockOnly: boolean): Promise<ShopCard[][]> {
  return guarded('hero pictures', [], async () => {
    if (!slugs.length) return [];
    const listings = await getPrisma().categoryProduct.findMany({
      where: {
        storeId,
        isVisible: true,
        product: { ...live, ...(inStockOnly ? { inStock: true } : {}) },
        category: { archivedAt: null, OR: [{ slug: { in: [...slugs] } }, { parent: { slug: { in: [...slugs] } } }] },
      },
      orderBy: [{ pinned: 'desc' }, { sortRank: 'desc' }, { productId: 'asc' }],
      select: { productId: true, category: { select: { slug: true, parent: { select: { slug: true } } } } },
      take: 4000,
    });
    const taken = new Set<string>();
    const picks = new Map<string, string[]>(slugs.map((s) => [s, []]));
    for (const l of listings) {
      const top = slugs.includes(l.category.slug) ? l.category.slug : (l.category.parent?.slug ?? '');
      const list = picks.get(top);
      if (!list || list.length >= perCategory || taken.has(l.productId)) continue;
      list.push(l.productId);
      taken.add(l.productId);
    }
    const cards = await toCards(storeId, await rowsOf({ where: { id: { in: [...taken] } } }));
    const byId = new Map(cards.map((c) => [c.id, c]));
    return slugs.map((s) => (picks.get(s) ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])));
  });
}

/**
 * PR 43 · a collection's products in its own order, for the hero (a campaign, CN-012): null when the collection does
 * not exist, is archived or is outside its dates — the categories fill the hero then.
 */
export function heroCollectionCards(storeId: number, slug: string, count: number, inStockOnly: boolean, now = new Date()): Promise<ShopCard[] | null> {
  return guarded('hero collection', null, async () => {
    const prisma = getPrisma();
    const col = await prisma.collection.findFirst({
      where: {
        storeId,
        slug,
        archivedAt: null,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { id: true },
    });
    if (!col) return null;
    const links = await prisma.collectionProduct.findMany({
      where: { storeId, collectionId: col.id, archivedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { productId: true },
      take: 200,
    });
    const order = links.map((l) => l.productId);
    const rows = await rowsOf({
      where: { id: { in: order }, storeId, ...live, ...(inStockOnly ? { inStock: true } : {}), category: { isVisible: true, archivedAt: null } },
    });
    const cards = await toCards(storeId, rows);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, count);
  });
}

// ---- PR 44 · the flash sale ----

/** The most products the "every real markdown" sale reads (in the owner's order) before it keeps the markdowns. */
export const FLASH_READ_CAP = 200;

/**
 * The flash sale's products as cards, in the sale's order: the owner's own list, a collection (only while its own dates
 * run), or every product whose card carries a struck price the PR 38 rule allows. Only what a customer may see now
 * (published, in a shown category), in stock when `inStockOnly`. Which of them show is the flash model's (flash-model.ts).
 */
export function flashSaleCards(
  storeId: number,
  sale: Pick<HomeFlashSale, 'source' | 'productIds' | 'collection'>,
  inStockOnly: boolean,
  now = new Date(),
  trial?: PriceRuleTrial,
): Promise<ShopCard[]> {
  return guarded('flash sale', [] as ShopCard[], async () => {
    const shown = { storeId, ...live, ...(inStockOnly ? { inStock: true } : {}), category: { isVisible: true, archivedAt: null } };
    if (sale.source === 'collection') return sale.collection ? ((await heroCollectionCards(storeId, sale.collection, FLASH_READ_CAP, inStockOnly, now)) ?? []) : [];
    if (sale.source === 'products') {
      if (!sale.productIds.length) return [];
      const byId = new Map((await toCards(storeId, await rowsOf({ where: { ...shown, id: { in: [...sale.productIds] } } }), true, trial)).map((c) => [c.id, c]));
      return sale.productIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    }
    const rows = await rowsOf({ where: shown, orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }], take: FLASH_READ_CAP });
    return (await toCards(storeId, rows, true, trial)).filter((c) => c.priceMinor != null && c.wasMinor != null && c.wasMinor > c.priceMinor);
  });
}

// ---- PR 45 · the category page ----

/** The most products one category page reads (a guard; a category this long wants sub-categories). */
export const CATEGORY_READ_CAP = 2000;

const listSelect = {
  ...cardSelect,
  publishedAt: true,
  variants: {
    where: { archivedAt: null, active: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      colourId: true,
      priceMinor: true,
      compareAtMinor: true,
      inStock: true,
      colour: { select: { key: true } },
      size: { select: { key: true, label: true, sortOrder: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type ListRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;

export interface CategoryHead {
  /** PR 221: the category's id (its accepted AI search texts are kept under it). */
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  introEn: string | null;
  introBn: string | null;
  /** The parent category, for the breadcrumb of a sub-category. */
  parent: { slug: string; nameEn: string; nameBn: string | null } | null;
}

export interface CategoryData {
  /** null = the "New in" page (every shown category's newest styles). */
  head: CategoryHead | null;
  /** The category's products as cards (without photos) and as filter items, in the owner's order, one to one. */
  cards: ShopCard[];
  items: CatItem[];
  /** The sizes the shop knows, by key (label and order) — only those the products carry. */
  sizes: Map<string, SizeMeta>;
  /** The catalogue could not be read just now (the page says so and stays out of search engines). */
  unavailable?: boolean;
  /** The photos for the cards about to be drawn (the page shown, not the whole category). */
  withPhotos: (cards: readonly ShopCard[]) => Promise<ShopCard[]>;
}

const EMPTY_CATEGORY = (head: CategoryHead | null): CategoryData => ({ head, cards: [], items: [], sizes: new Map(), withPhotos: async (c) => [...c] });

/**
 * One category page's products: a shown category (its own and its sub-categories' listings, pinned first, then the
 * owner's order), or with `newIn` the newest published styles of every shown category. Undefined when there is no
 * such shown category (the page answers "not found"); without a database the page draws empty.
 */
export async function categoryData(
  storeId: number,
  slug: string,
  newIn: { slug: string; order: 'newest' | 'rank'; days: number; ratings: boolean } | { slug?: undefined; ratings: boolean },
  now = new Date(),
): Promise<CategoryData | undefined> {
  if (!process.env.DATABASE_URL) return newIn.slug === slug ? EMPTY_CATEGORY(null) : undefined;
  try {
    // PR 602: kept by the server for `cache.pages.categoryMinutes`; any product on it, or any category change, clears it
    return await withTimeout(
      cachedCategoryPage(storeId, `${slug}:${JSON.stringify(newIn)}`, () => readCategory(storeId, slug, newIn, now)),
      settingsTimeoutMs() * 3,
    );
  } catch (e) {
    console.warn(`shop: category page unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { ...EMPTY_CATEGORY(null), unavailable: true };
  }
}

async function readCategory(
  storeId: number,
  slug: string,
  newIn: { slug: string; order: 'newest' | 'rank'; days: number; ratings: boolean } | { slug?: undefined; ratings: boolean },
  now: Date,
): Promise<CategoryData | undefined> {
  const prisma = getPrisma();
  const cat = await prisma.category.findFirst({
    where: { storeId, slug, isVisible: true, archivedAt: null },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameBn: true,
      introEn: true,
      introBn: true,
      parent: { select: { slug: true, nameEn: true, nameBn: true, isVisible: true, archivedAt: true } },
      children: { where: { isVisible: true, archivedAt: null }, select: { id: true } },
    },
  });
  let ids: string[];
  let head: CategoryHead | null = null;
  if (cat) {
    // a real category of that name wins over the "New in" page
    head = {
      id: cat.id,
      slug: cat.slug,
      nameEn: cat.nameEn,
      nameBn: cat.nameBn,
      introEn: cat.introEn,
      introBn: cat.introBn,
      parent: cat.parent && cat.parent.isVisible && !cat.parent.archivedAt ? { slug: cat.parent.slug, nameEn: cat.parent.nameEn, nameBn: cat.parent.nameBn } : null,
    };
    const listings = await prisma.categoryProduct.findMany({
      where: { storeId, isVisible: true, categoryId: { in: [cat.id, ...cat.children.map((c) => c.id)] }, product: live },
      orderBy: [{ pinned: 'desc' }, { sortRank: 'desc' }, { productId: 'asc' }],
      select: { productId: true },
      take: CATEGORY_READ_CAP * 2,
    });
    ids = [...new Set(listings.map((l) => l.productId))].slice(0, CATEGORY_READ_CAP);
  } else if (newIn.slug === slug) {
    const since = newIn.days > 0 ? new Date(now.getTime() - newIn.days * 86_400_000) : null;
    const rows = await prisma.product.findMany({
      where: { storeId, ...live, category: { isVisible: true, archivedAt: null }, ...(since ? { publishedAt: { gte: since } } : {}) },
      orderBy: newIn.order === 'newest' ? [{ publishedAt: 'desc' }, { sortRank: 'desc' }, { nameEn: 'asc' }] : [{ sortRank: 'desc' }, { nameEn: 'asc' }],
      select: { id: true },
      take: CATEGORY_READ_CAP,
    });
    ids = rows.map((r) => r.id);
  } else return undefined;
  if (!ids.length) return EMPTY_CATEGORY(head);
  return { head, ...(await listingOf(storeId, ids, { where: {}, ratings: newIn.ratings })) };
}

/** A list of products as a page draws it, without a head (PR 45 category page, PR 73 search results). */
export type Listing = Omit<CategoryData, 'head' | 'unavailable'>;

/**
 * PR 45 / 73 — products by id, in the order given, as cards (without photos) and filter items, with the sizes they
 * carry and the photos for the cards drawn. `where` narrows which of them may show (PR 73: only live, sellable ones).
 */
async function listingOf(storeId: number, wanted: readonly string[], opts: { where: Prisma.ProductWhereInput; ratings: boolean }): Promise<Listing> {
  const prisma = getPrisma();
  const found = await prisma.product.findMany({ where: { ...opts.where, id: { in: [...wanted] } }, select: listSelect });
  const byId = new Map(found.map((r) => [r.id, r]));
  const rows: ListRow[] = wanted.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const ids = rows.map((r) => r.id);
  if (!rows.length) return { cards: [], items: [], sizes: new Map(), withPhotos: async (c) => [...c] };
  const [cards, tags, ratings] = await Promise.all([
    toCards(storeId, rows, false),
    prisma.productTag.findMany({
      where: { storeId, archivedAt: null, productId: { in: ids }, tag: { archivedAt: null } },
      select: { productId: true, tag: { select: { slug: true } } },
    }),
    opts.ratings
      ? prisma.review.groupBy({
          by: ['productId'],
          where: { storeId, status: 'APPROVED', archivedAt: null, publishedAt: { not: null }, productId: { in: ids } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const tagsOf = new Map<string, string[]>();
  for (const t of tags) tagsOf.set(t.productId, [...(tagsOf.get(t.productId) ?? []), t.tag.slug]);
  const rated = new Map(ratings.map((r) => [r.productId, { rating: r._avg.rating ?? 0, reviews: r._count._all }]));
  const sizes = new Map<string, SizeMeta>();
  const items: CatItem[] = rows.map((p, i) => {
    for (const v of p.variants) if (v.size && !sizes.has(v.size.key)) sizes.set(v.size.key, { key: v.size.key, label: v.size.label, order: v.size.sortOrder });
    const card = cards[i]!;
    return {
      id: p.id,
      price: card.priceMinor,
      was: card.wasMinor,
      colours: card.colours.map((c) => c.key),
      stock: p.variants.flatMap((v) => (v.size ? [{ size: v.size.key, colour: v.colour?.key ?? null, inStock: v.inStock }] : [])),
      fit: card.fit,
      inStock: p.inStock,
      published: p.publishedAt?.getTime() ?? 0,
      rating: rated.get(p.id)?.rating ?? 0,
      reviews: rated.get(p.id)?.reviews ?? 0,
      tags: tagsOf.get(p.id) ?? [],
    };
  });
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  return {
    cards,
    items,
    sizes,
    withPhotos: async (list) => {
      const pick = list.flatMap((c) => (rowOf.has(c.id) ? [rowOf.get(c.id)!] : []));
      const photos = await guarded('category photos', new Map<string, Record<string, ImageSource>>(), () => photoMap(storeId, pick));
      return list.map((c) => ({ ...c, photos: photos.get(c.id) ?? c.photos }));
    },
  };
}

// ---- PR 72 / 73 · search ----

/**
 * PR 73 — the products a search found, in the engine's order, as the results page draws them: only those a customer
 * may buy now — published, not archived, in a shown category, with an active variant that has a price — whatever the
 * search index still holds. `unavailable`: the catalogue could not be read just now (the page says so).
 */
export async function searchListing(storeId: number, ids: readonly string[], ratings: boolean): Promise<Listing & { unavailable?: boolean }> {
  const none: Listing = { cards: [], items: [], sizes: new Map(), withPhotos: async (c) => [...c] };
  if (!process.env.DATABASE_URL || !ids.length) return none;
  try {
    return await withTimeout(
      listingOf(storeId, ids, {
        where: { storeId, ...live, category: { isVisible: true, archivedAt: null }, variants: { some: { archivedAt: null, active: true, priceMinor: { not: null } } } },
        ratings,
      }),
      settingsTimeoutMs() * 3,
    );
  } catch (e) {
    console.warn(`shop: search results unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return { ...none, unavailable: true };
  }
}

/**
 * PR 72 — of the products a search found, those the results page would show (the same rule as searchListing; with
 * `inStockOnly`, the owner hides sold-out styles), in the order given: the panel's "See all N results" counts these.
 */
export function sellableIds(storeId: number, ids: readonly string[], inStockOnly: boolean): Promise<string[]> {
  return guarded('search products', [] as string[], async () => {
    if (!ids.length) return [];
    const rows = await getPrisma().product.findMany({
      where: {
        storeId,
        id: { in: [...ids] },
        ...live,
        ...(inStockOnly ? { inStock: true } : {}),
        category: { isVisible: true, archivedAt: null },
        variants: { some: { archivedAt: null, active: true, priceMinor: { not: null } } },
      },
      select: { id: true },
    });
    const ok = new Set(rows.map((r) => r.id));
    return ids.filter((id) => ok.has(id));
  });
}

/** PR 72 — shown categories by id, in the order given (the categories a search found). */
export function categoriesByIds(storeId: number, ids: readonly string[]): Promise<CategoryHead[]> {
  return guarded('search categories', [] as CategoryHead[], async () => {
    if (!ids.length) return [];
    const rows = await getPrisma().category.findMany({
      where: { storeId, id: { in: [...ids] }, isVisible: true, archivedAt: null },
      select: { id: true, slug: true, nameEn: true, nameBn: true, introEn: true, introBn: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = byId.get(id);
      return r ? [{ id: r.id, slug: r.slug, nameEn: r.nameEn, nameBn: r.nameBn, introEn: r.introEn, introBn: r.introBn, parent: null }] : [];
    });
  });
}

// ---- PR 107 / 114 · the bag ----

/** PR 107 · products by id as cards (the bag's pictures: the photo of each colour or the drawing), archived ones too. */
export function cardsByIds(storeId: number, ids: readonly string[]): Promise<Map<string, ShopCard>> {
  return guarded('bag pictures', new Map<string, ShopCard>(), async () => {
    if (!ids.length) return new Map<string, ShopCard>();
    const cards = await toCards(storeId, await rowsOf({ where: { storeId, id: { in: [...new Set(ids)] } } }));
    return new Map(cards.map((c) => [c.id, c]));
  });
}

/**
 * PR 67 / 71 · products by id as cards, in the order given, only those a customer may see now (published, not archived,
 * in a visible category): the "Recently viewed" row and the wishlist page.
 */
export function liveCardsByIds(storeId: number, ids: readonly string[]): Promise<ShopCard[]> {
  return guarded('cards by id', [] as ShopCard[], async () => {
    if (!ids.length) return [];
    const rows = await rowsOf({ where: { storeId, id: { in: [...new Set(ids)] }, ...live, category: { isVisible: true, archivedAt: null } } });
    const byId = new Map((await toCards(storeId, rows)).map((c) => [c.id, c]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  });
}

/**
 * PR 114 · "You may also like" under the bag (and the panel's "Complete the look", PR 106): published, in-stock products
 * from the same categories as the bag's items (the first item's category first), never one already in the bag. `from`
 * says where they came from, so the line under the row's title is true: `same` = the same categories; `new` = none
 * there, so the newest products fill it; `none` = nothing to show (the row is not drawn).
 */
export function bagPickCards(storeId: number, inBag: readonly string[], count: number): Promise<{ cards: ShopCard[]; from: 'same' | 'new' | 'none' }> {
  const none = { cards: [] as ShopCard[], from: 'none' as const };
  return guarded('bag picks', none, async () => {
    if (count <= 0 || !inBag.length) return none;
    const prisma = getPrisma();
    const own = await prisma.product.findMany({ where: { storeId, id: { in: [...inBag] } }, select: { id: true, categoryId: true } });
    const cats = [...new Set(inBag.map((id) => own.find((p) => p.id === id)?.categoryId).filter((x): x is string => !!x))];
    const base = { storeId, ...live, inStock: true, id: { notIn: [...inBag] }, category: { isVisible: true, archivedAt: null } };
    if (cats.length) {
      const rows = await rowsOf({ where: { ...base, categoryId: { in: cats } }, orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }], take: count * 3 });
      rows.sort((a, b) => cats.indexOf(a.categoryId ?? '') - cats.indexOf(b.categoryId ?? ''));
      if (rows.length) return { cards: await toCards(storeId, rows.slice(0, count)), from: 'same' as const };
    }
    const rows = await rowsOf({ where: base, orderBy: [{ publishedAt: 'desc' }, { sortRank: 'desc' }, { nameEn: 'asc' }], take: count });
    return rows.length ? { cards: await toCards(storeId, rows), from: 'new' as const } : none;
  });
}
