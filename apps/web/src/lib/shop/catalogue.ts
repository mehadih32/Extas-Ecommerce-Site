// PR 41 / 45 / 49 — what the shop's pages read from the catalogue: published products as cards (name, price, colours,
// the photo or the drawing, the badge), the category tiles. Read-only and public: no permission, nothing a customer
// may not see. Every price is the shop's own variant price; a struck "was" price only ever comes from the honesty rule
// of PR 38 (`wasPriceFor`): with no source chosen by the owner, there is none anywhere. Without a database (CI,
// `next build`) or when it is slow, the lists are empty and the page still draws.
import { getPrisma, type Prisma } from '@extas/db/client';
import { wasPriceFor, type WasPriceSource } from '@extas/catalogue';
import { imageSources, type ImageSource } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
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

interface PriceRules {
  store: WasPriceSource | null;
  historyDays: number;
  mrpOwnLabel: boolean;
  /** Each category's own source and parent, for the product → category → parents → store chain. */
  cats: Map<string, { source: WasPriceSource | null; parentId: string | null }>;
}

async function priceRules(storeId: number): Promise<PriceRules> {
  const r = settingsResolver();
  const at = { storeId };
  const [store, historyDays, mrpOwnLabel] = r
    ? await Promise.all([r.value('catalogue.wasPrice.defaultSource', at), r.value('catalogue.wasPrice.historyDays', at), r.value('catalogue.wasPrice.mrpOwnLabel', at)])
    : [null, 0, false];
  const rows = await getPrisma().category.findMany({ where: { storeId }, select: { id: true, parentId: true, wasPriceSource: true } });
  return { store: store ?? null, historyDays, mrpOwnLabel, cats: new Map(rows.map((c) => [c.id, { source: c.wasPriceSource, parentId: c.parentId }])) };
}

function sourceOf(rules: PriceRules, product: { wasPriceSource: WasPriceSource | null; categoryId: string | null }): WasPriceSource | null {
  if (product.wasPriceSource) return product.wasPriceSource;
  for (let id = product.categoryId, guard = 0; id && guard < 64; guard++) {
    const c = rules.cats.get(id);
    if (!c) break;
    if (c.source) return c.source;
    id = c.parentId;
  }
  return rules.store;
}

async function toCards(storeId: number, rows: Row[]): Promise<ShopCard[]> {
  if (!rows.length) return [];
  const prisma = getPrisma();
  const rules = await priceRules(storeId);
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
  const assetIds = [...new Set(rows.flatMap((p) => p.media.map((m) => m.assetId)))];
  const resolver = settingsResolver();
  const photos = assetIds.length && resolver ? await imageSources({ db: prisma, settings: resolver }, storeId, assetIds) : new Map<string, ImageSource>();
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
    const colourKey = new Map(p.colours.map((c) => [c.colour.id, c.colour.key]));
    const shots: Record<string, ImageSource> = {};
    for (const m of p.media) {
      const img = photos.get(m.assetId);
      if (!img) continue;
      const key = m.colourId ? colourKey.get(m.colourId) : '*';
      if (key && !shots[key]) shots[key] = img;
    }
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
      photos: shots,
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
