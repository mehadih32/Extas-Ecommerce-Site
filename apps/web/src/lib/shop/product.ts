// PR 49 — what the product page reads from the catalogue, in one go: the product by its link, its colours and sizes in
// the owner's order, every variant with what can be sold of it now (the stock mirror, PR 195: sellable locations only,
// cart holds taken off), its price and honest struck price (PR 38), the photos of each colour, the size chart (PR 27),
// the fabric and care, and the live rule texts of the product page (Smart Rules, PR 215). Read-only and public. A
// product that was on the shop and is now sold out or taken off keeps its page as a ghost (PR 36, never a 404); one
// that never was has no page. Without a database (CI, `next build`) or when it is slow, the page is "not found" rather
// than a guess.
import { getPrisma, type Prisma } from '@extas/db/client';
import { activeSizeEase, bothUnits, ghostState, groupKey, productFitKey, readMeta, readRows, sortRows, wasPriceFor, type GhostReason } from '@extas/catalogue';
import { bGradeClosed, sellableUnits } from '@extas/inventory';
import { imageSources, type ImageSource } from '@extas/media';
import { cachedProductPage, cachedStock } from '../cache';
import { placeTexts } from '../rules-public';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { priceRules, sourceOf } from './catalogue';
import { chartTable, pickChart, type FieldMeta } from './pdp-chart';
import { pageFacts } from './pdp-details';
import type { MediaRow } from './pdp-gallery';
import type { PdpChart } from './product-model';
import type { TemplateCategory } from './pdp-template';
import type { ShopLang } from './lang';

export interface ProductColourData {
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  noteEn: string | null;
  noteBn: string | null;
}

export interface ProductVariantData {
  id: string;
  colour: string | null;
  size: string | null;
  stock: number;
  priceMinor: number | null;
  /** Only when the honesty rule of PR 38 allows a struck price. */
  wasMinor: number | null;
}

export interface ProductData {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  garment: string | null;
  category: { slug: string; nameEn: string; nameBn: string | null } | null;
  /** live = on sale; ghost = sold out, taken off or archived (the page stays, everything sold out, PR 36). */
  state: 'live' | 'ghost';
  reason: GhostReason | null;
  freeDelivery: boolean;
  /** Follow-up 61 · the brand for search engines (C12.4: the real brand field); null = the store's own label. */
  brandName: string | null;
  /** The first live tag's words ("Bestseller"). */
  tag: string | null;
  fit: string | null;
  fitNote: string | null;
  fabricEn: string | null;
  fabricBn: string | null;
  gsm: number | null;
  careEn: string | null;
  careBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  colours: ProductColourData[];
  sizes: { key: string; label: string }[];
  variants: ProductVariantData[];
  media: MediaRow[];
  /** The size chart in both languages (its field names and "how to measure" differ). */
  chart: Record<ShopLang, PdpChart | null>;
  /** The live rule texts of the product page, per language (read when the page asks). */
  ruleTexts: (lang: ShopLang) => Promise<Awaited<ReturnType<typeof placeTexts>>>;
  /** PR 52: the template chosen for this product at upload, and its categories nearest first (for theirs). */
  templateKey: string | null;
  categoryChain: TemplateCategory[];
}

const productSelect = {
  id: true,
  slug: true,
  nameEn: true,
  nameBn: true,
  status: true,
  inStock: true,
  publishedAt: true,
  archivedAt: true,
  categoryId: true,
  wasPriceSource: true,
  freeDelivery: true,
  pdpBlocks: true,
  templateKey: true,
  careEn: true,
  careBn: true,
  descriptionEn: true,
  descriptionBn: true,
  brand: { select: { isOwnLabel: true, name: true, archivedAt: true } },
  fabric: { select: { nameEn: true, nameBn: true, gsm: true, careEn: true, careBn: true, archivedAt: true } },
  category: {
    select: {
      slug: true,
      nameEn: true,
      nameBn: true,
      isVisible: true,
      archivedAt: true,
      garmentType: { select: { id: true, key: true, measurementFields: true } },
    },
  },
  colours: {
    where: { archivedAt: null, colour: { archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    select: { noteEn: true, noteBn: true, trueColourAssetId: true, colour: { select: { id: true, key: true, nameEn: true, nameBn: true, hex: true } } },
  },
  variants: {
    where: { archivedAt: null, active: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      colourId: true,
      priceMinor: true,
      compareAtMinor: true,
      inStock: true,
      size: { select: { key: true, label: true, sortOrder: true, archivedAt: true } },
      stockLevels: {
        select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } },
      },
    },
  },
  media: {
    where: { archivedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, assetId: true, colourId: true, role: true },
  },
} satisfies Prisma.ProductSelect;

/**
 * The product page's data, or null (no such product, never on the shop, or the catalogue is out of reach). PR 602: the
 * server keeps it for `cache.pages.productMinutes` (cleared the moment its price, stock, words or photos change), and
 * the stock shown is read again every `cache.stockDisplaySeconds` (display only: the bag and the checkout read it live).
 */
export async function productData(storeId: number, slug: string, now = new Date()): Promise<ProductData | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await withTimeout(
      (async () => {
        const data = await cachedProductPage(storeId, slug, () => readProduct(storeId, slug, now));
        if (!data) return null;
        const stock = await cachedStock(storeId, data.id, () => liveStock(storeId, data.id));
        // a kept page is shared by every visitor: the stock goes on a copy
        return { ...data, variants: data.variants.map((v) => ({ ...v, stock: stock.get(v.id) ?? v.stock })) };
      })(),
      settingsTimeoutMs() * 3,
    );
  } catch (e) {
    console.warn(`shop: product page unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/**
 * PR 602: each variant's sellable stock now, as the page shows it (0 when it is marked sold out). PR 610: a B-grade piece
 * counts 0 while the ERP takes no B-grade line (`bGradeClosed`), as the bag refuses it.
 */
async function liveStock(storeId: number, productId: string): Promise<Map<string, number>> {
  const r = settingsResolver();
  const [kinds, closed] = await Promise.all([
    r ? r.value('inventory.sellableLocationKinds', { storeId }) : Promise.resolve(['WAREHOUSE'] as const),
    r ? bGradeClosed({ settings: r }, storeId) : Promise.resolve(false),
  ]);
  const kindSet = new Set(kinds);
  const rows = await getPrisma().productVariant.findMany({
    where: { storeId, productId, archivedAt: null, active: true },
    select: { id: true, inStock: true, grade: true, stockLevels: productSelect.variants.select.stockLevels },
  });
  return new Map(rows.map((v) => [v.id, v.inStock && !(closed && v.grade === 'B') ? sellableUnits(v.stockLevels, kindSet) : 0]));
}

const fieldsOf = (json: unknown): { key: string; labelEn: string; labelBn: string; unit: 'inch' | 'cm' }[] =>
  Array.isArray(json)
    ? json.flatMap((f) =>
        f && typeof f === 'object' && typeof f.key === 'string'
          ? [{ key: f.key, labelEn: typeof f.labelEn === 'string' ? f.labelEn : f.key, labelBn: typeof f.labelBn === 'string' ? f.labelBn : f.labelEn ?? f.key, unit: f.unit === 'cm' ? 'cm' : 'inch' } as const]
          : [],
      )
    : [];

async function readProduct(storeId: number, slug: string, now: Date): Promise<ProductData | null> {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({ where: { storeId_slug: { storeId, slug } }, select: productSelect });
  if (!p) return null;
  const page = ghostState(p);
  if (!page) return null;
  const r = settingsResolver();
  const at = { storeId };
  const [kinds, fits, fallbackFit, howTo, cmDecimals, defaultEase, sizeAdvice, rules, tags] = await Promise.all([
    r ? r.value('inventory.sellableLocationKinds', at) : Promise.resolve(['WAREHOUSE' as const]),
    r ? r.value('catalogue.fits', at) : Promise.resolve([]),
    r ? r.value('catalogue.sizeCharts.fallbackFit', at) : Promise.resolve(''),
    r ? r.value('catalogue.sizeCharts.howToMeasure', at) : Promise.resolve({}),
    r ? r.value('catalogue.sizeCharts.cmDecimals', at) : Promise.resolve(0),
    r ? r.value('catalogue.sizeCharts.defaultEaseInch', at) : Promise.resolve(0),
    // PR 59: the ease a trained version gives, only while the owner has `useTrainedEase` on (off: not one query)
    r ? r.value('catalogue.sizeAdvice', at) : Promise.resolve(null),
    priceRules(storeId),
    prisma.productTag.findMany({
      where: { storeId, archivedAt: null, productId: p.id, tag: { archivedAt: null } },
      orderBy: { createdAt: 'asc' },
      take: 1,
      select: { tag: { select: { name: true } } },
    }),
  ]);
  const kindSet = new Set(kinds);

  // ---- colours, sizes, variants with their sellable stock ----
  const colourKey = new Map(p.colours.map((c) => [c.colour.id, c.colour.key]));
  const colours: ProductColourData[] = p.colours.map((c) => ({
    key: c.colour.key,
    nameEn: c.colour.nameEn,
    nameBn: c.colour.nameBn,
    hex: c.colour.hex,
    noteEn: c.noteEn,
    noteBn: c.noteBn,
  }));
  const live = p.variants.filter((v) => (!v.colourId || colourKey.has(v.colourId)) && !v.size?.archivedAt);
  const sizeRows = new Map<string, { key: string; label: string; sortOrder: number }>();
  for (const v of live) if (v.size && !sizeRows.has(v.size.key)) sizeRows.set(v.size.key, v.size);
  const sizes = [...sizeRows.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map((s) => ({ key: s.key, label: s.label }));

  // ---- the honest struck price per variant (PR 38) ----
  const source = sourceOf(rules, p);
  const history =
    source === 'PRICE_HISTORY' && live.length
      ? await prisma.priceHistory.findMany({ where: { storeId, variantId: { in: live.map((v) => v.id) } }, select: { variantId: true, priceMinor: true, effectiveFrom: true } })
      : [];
  const variants: ProductVariantData[] = live.map((v) => ({
    id: v.id,
    colour: v.colourId ? (colourKey.get(v.colourId) ?? null) : null,
    size: v.size?.key ?? null,
    stock: v.inStock ? sellableUnits(v.stockLevels, kindSet) : 0,
    priceMinor: v.priceMinor,
    wasMinor:
      v.priceMinor == null
        ? null
        : wasPriceFor({
            source,
            priceMinor: v.priceMinor,
            compareAtMinor: v.compareAtMinor,
            brand: p.brand,
            mrpOwnLabel: rules.mrpOwnLabel,
            history: history.filter((h) => h.variantId === v.id),
            historyDays: rules.historyDays,
            now,
          }).wasMinor,
  }));

  // ---- photos: one look-up of every asset (the colour's true-colour photo is one of its shots) ----
  const trueShots = p.colours.flatMap((c) => (c.trueColourAssetId ? [{ id: `true-${c.colour.key}`, assetId: c.trueColourAssetId, colourId: c.colour.id, role: 'TRUE_COLOUR' }] : []));
  const rows = [...p.media.filter((m) => m.role !== 'VIDEO'), ...trueShots.filter((t) => !p.media.some((m) => m.assetId === t.assetId))];
  const assetIds = [...new Set(rows.map((m) => m.assetId))];
  const photos = assetIds.length && r ? await imageSources({ db: prisma, settings: r }, storeId, assetIds) : new Map<string, ImageSource>();
  const media: MediaRow[] = rows.flatMap((m) => {
    const photo = photos.get(m.assetId) ?? null;
    if (!photo) return [];
    const key = m.colourId ? colourKey.get(m.colourId) : null;
    return m.colourId && !key ? [] : [{ id: m.id, colour: key ?? null, role: m.role, photo }];
  });

  // ---- the size chart: the product's own, else its category's (then the parents'), of its fit ----
  const facts = pageFacts(p.pdpBlocks);
  const chain: string[] = [];
  for (let id = p.categoryId, guard = 0; id && guard < 64; guard++) {
    chain.push(id);
    id = rules.cats.get(id)?.parentId ?? null;
  }
  const garmentType = p.category?.garmentType ?? null;
  // PR 52: each category of the chain with the template stored on it, nearest first
  const chainRows = chain.length
    ? await prisma.category.findMany({ where: { storeId, id: { in: chain }, archivedAt: null }, select: { id: true, slug: true, templateKey: true } })
    : [];
  const categoryChain: TemplateCategory[] = chain.flatMap((id) => {
    const c = chainRows.find((x) => x.id === id);
    return c ? [{ slug: c.slug, templateKey: c.templateKey }] : [];
  });
  let chart: Record<ShopLang, PdpChart | null> = { en: null, bn: null };
  if (sizes.length > 1) {
    const assigned = await prisma.sizeChartAssignment.findMany({
      where: { storeId, archivedAt: null, OR: [{ productId: p.id }, ...(chain.length ? [{ categoryId: { in: chain } }] : [])], sizeChart: { archivedAt: null } },
      select: { productId: true, categoryId: true, sizeChart: { select: { id: true, name: true, fitKey: true, columns: true, rows: true, garmentTypeId: true } } },
    });
    const list = assigned
      .filter((a) => !garmentType || a.sizeChart.garmentTypeId === garmentType.id || a.productId)
      .map((a) => ({ id: a.sizeChart.id, fitKey: a.sizeChart.fitKey, productId: a.productId, categoryId: a.categoryId, chart: a.sizeChart }));
    const pick = pickChart(list, p.id, chain, productFitKey(p.pdpBlocks, fits), fallbackFit);
    if (pick) {
      const fields = fieldsOf(garmentType?.measurementFields);
      const meta = readMeta(pick.chart.columns);
      const order = sizes.map((s) => s.key);
      // PR 59: the chart's own ease, unless a trained version for this garment type and fit is switched on and the
      // owner has the trained ease on (the chart itself is never changed)
      const trained = sizeAdvice?.useTrainedEase ? (await activeSizeEase({ db: prisma }, storeId)).get(groupKey(pick.chart.garmentTypeId, pick.chart.fitKey ?? null)) : undefined;
      const input = { name: pick.chart.name, fields: meta.fields, rows: sortRows(readRows(pick.chart.rows), order), easeInch: trained ?? meta.easeInch ?? defaultEase };
      const convert = (v: number, unit: 'inch' | 'cm') => bothUnits(v, unit, cmDecimals);
      const metaFor = (lang: ShopLang) =>
        new Map<string, FieldMeta>(
          meta.fields.map((k) => {
            const f = fields.find((x) => x.key === k);
            const how = (howTo as Record<string, { en: string; bn: string } | undefined>)[k];
            return [k, { key: k, label: (lang === 'bn' ? f?.labelBn : f?.labelEn) ?? k, unit: f?.unit ?? 'inch', howTo: how ? (lang === 'bn' ? how.bn || how.en : how.en) : null }];
          }),
        );
      chart = { en: chartTable(input, metaFor('en'), order, convert), bn: chartTable(input, metaFor('bn'), order, convert) };
    }
  }

  const fabric = p.fabric && !p.fabric.archivedAt ? p.fabric : null;
  const cat = p.category && p.category.isVisible && !p.category.archivedAt ? p.category : null;
  return {
    id: p.id,
    slug: p.slug,
    nameEn: p.nameEn,
    nameBn: p.nameBn,
    garment: garmentType?.key ?? null,
    category: cat ? { slug: cat.slug, nameEn: cat.nameEn, nameBn: cat.nameBn } : null,
    state: page.state,
    reason: page.reason,
    freeDelivery: p.freeDelivery === true,
    brandName: p.brand && !p.brand.isOwnLabel && !p.brand.archivedAt ? p.brand.name.trim() || null : null,
    tag: tags[0]?.tag.name ?? null,
    fit: facts.fit,
    fitNote: facts.fitNote,
    fabricEn: fabric?.nameEn ?? null,
    fabricBn: fabric?.nameBn ?? null,
    gsm: fabric?.gsm ?? null,
    careEn: p.careEn ?? fabric?.careEn ?? null,
    careBn: p.careBn ?? fabric?.careBn ?? null,
    descriptionEn: p.descriptionEn,
    descriptionBn: p.descriptionBn,
    colours,
    sizes,
    variants,
    media,
    chart,
    ruleTexts: (lang) => placeTexts({ storeId, placement: 'product', locale: lang, productId: p.id }),
    templateKey: p.templateKey,
    categoryChain,
  };
}
