// S28 · PR 1031 — what the add-product wizard reads before it draws a step (prototype v5, "Add product", 8 steps). The same
// catalogue services as the product screen, as the signed-in person; a draft that is not this shop's is "not found". Nothing is written here.
import * as cat from '@extas/catalogue';
import * as inv from '@extas/inventory';
import { productGallery, type ProductPhoto } from '@extas/media';
import { mediaDeps } from './media';
import type { CatalogueAccess } from './admin-products';

export interface WizardColour {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  /** Pieces per size id (the ERP's stock, read only). */
  bySize: Record<string, number>;
  total: number;
  /** Photos on this colour and whether one is its front photo. */
  photos: number;
  front: boolean;
}

export interface WizardSize {
  id: string;
  label: string;
}

export interface WizardData {
  productId: string;
  status: string;
  nameEn: string;
  nameBn: string | null;
  erpName: string;
  erpStyleCode: string | null;
  categoryId: string | null;
  garmentKey: string | null;
  brandId: string | null;
  descriptionEn: string | null;
  focusKeyword: string | null;
  slug: string;
  seoTitleEn: string;
  metaDescriptionEn: string;
  colours: WizardColour[];
  sizes: WizardSize[];
  variants: number;
  pieces: number;
  /** Buying price (the dearest "bought from ERP at" among the kept variants) and the selling and crossed-out price, minor units; null without `catalogue.prices`. */
  costMinor: number | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
  spec: cat.WizardSpecView;
  /** The names given to colours on this product's page (colour id → name). */
  colourNames: Record<string, string>;
  tagIds: string[];
  faqs: { id: string; q: string; a: string }[];
  categoryFaqs: number;
  chart: { assignedId: string | null; assignedName: string | null; erp: cat.ErpChartView };
  /** The "Outlet" listing: B-grade pieces in the ERP for this style. */
  bGradePieces: number;
  video: boolean;
  photoCount: number;
  gallery: ProductPhoto[] | null;
}

export interface WizardLists {
  categories: cat.CategoryNode[];
  brands: cat.BrandView[];
  tags: cat.TagView[];
  /** The colour list (name and shade), to draw the ERP's colour names. */
  colours: { nameEn: string; hex: string }[];
  charts: { id: string; name: string; garmentKey: string; sizes: string[] }[];
  bottoms: { id: string; name: string; styleCode: string | null; sizes: string[]; pieces: number }[];
}

/** The lists every step picks from. */
export async function loadWizardLists(c: CatalogueAccess): Promise<WizardLists> {
  const [tree, brands, tags, charts, colours, products] = await Promise.all([
    cat.categoryTree(c.deps, c.who),
    cat.listBrands(c.deps, c.who),
    cat.listTags(c.deps, c.who),
    cat.listSizeCharts(c.deps, c.who),
    cat.listColours(c.deps, c.who),
    c.deps.db.product.findMany({
      where: { storeId: c.storeId, archivedAt: null, isDemo: false, status: 'PUBLISHED', category: { is: { garmentType: { is: { key: { in: [...cat.BOTTOM_GARMENT_KEYS] } } } } } },
      select: { id: true, nameEn: true, erpStyleCode: true, variants: { where: { archivedAt: null }, select: { size: { select: { label: true, sortOrder: true } }, stockLevels: { select: { onHand: true } } } } },
      orderBy: { nameEn: 'asc' },
      take: 200, // hardcode-ok: a page of candidates for a set's bottom piece
    }),
  ]);
  return {
    categories: cat.flatten(tree),
    brands: brands.filter((b) => !b.archived),
    tags: tags.filter((x) => !x.archived),
    colours: colours.filter((x) => !x.archived).map((x) => ({ nameEn: x.nameEn, hex: x.hex })),
    charts: charts
      .filter((x) => !x.archived)
      .map((x) => ({ id: x.id, name: x.name, garmentKey: x.garmentType.key, sizes: x.rows.map((r) => r.label) })),
    bottoms: products.map((p) => {
      const sizes = [...new Map(p.variants.filter((v) => v.size).map((v) => [v.size!.label, v.size!.sortOrder])).entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
      return { id: p.id, name: p.nameEn, styleCode: p.erpStyleCode, sizes, pieces: p.variants.reduce((n, v) => n + v.stockLevels.reduce((m, s) => m + s.onHand, 0), 0) };
    }),
  };
}

/** The ERP's styles the shop does not have yet (step 1's list); empty when the shop runs without an ERP. */
export async function loadErpStyles(deps: inv.InventoryDeps, who: inv.Who): Promise<inv.NewErpStyles | null> {
  try {
    return await inv.newErpStyles(deps, who);
  } catch {
    return null;
  }
}

/** One draft, read for its steps. */
export async function loadWizard(c: CatalogueAccess, id: string): Promise<WizardData> {
  const product = await cat.getProduct(c.deps, c.who, id);
  const canPrices = c.can('catalogue.prices');
  const [naming, stock, spec, colourNames, tagList, faqList, readiness, erp, rows] = await Promise.all([
    cat.namingView(c.deps, c.who, id),
    cat.productStock(c.deps, c.who, id),
    cat.readWizardSpec(c.deps, c.who, id),
    cat.readWizardColourNames(c.deps, c.who, id),
    cat.productTags(c.deps, c.who, id),
    cat.listFaqs(c.deps, c.who, { scope: 'PRODUCT', productId: id }),
    cat.productReadiness(c.deps, c.who, id),
    cat.erpChartView(c.deps, c.who, id),
    canPrices
      ? c.deps.db.productVariant.findMany({ where: { storeId: c.storeId, productId: id, archivedAt: null }, select: { id: true, shopPriceMinor: true, avgCostMinor: true } })
      : Promise.resolve([] as { id: string; shopPriceMinor: number | null; avgCostMinor: number | null }[]),
  ]);
  const media = mediaDeps();
  const gallery = media && c.can('media.read') ? (await productGallery(media, c.who.actor, { storeId: c.storeId, productId: id })).photos : null;
  const offSize = new Set(spec.hiddenSizeIds);
  const live = product.variants.filter((v) => !v.archived);
  const kept = live.filter((v) => !(v.size && offSize.has(v.size.id)));
  const sizeMap = new Map(live.filter((v) => v.size).map((v) => [v.size!.id, v.size!]));
  const sizes = [...sizeMap.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ id: s.id, label: s.label }));
  const colours: WizardColour[] = product.colours
    .filter((pc) => !pc.archived)
    .map((pc) => {
      const own = (gallery ?? []).filter((g) => g.colourId === pc.colourId);
      const bySize: Record<string, number> = {};
      let total = 0;
      for (const v of live.filter((x) => x.colour?.id === pc.colourId && x.size)) {
        bySize[v.size!.id] = (bySize[v.size!.id] ?? 0) + (stock[v.id] ?? 0);
        total += stock[v.id] ?? 0;
      }
      return { id: pc.colourId, key: pc.key, nameEn: pc.nameEn, nameBn: pc.nameBn, hex: pc.hex, bySize, total, photos: own.length, front: own.some((g) => g.role === 'FRONT') };
    });
  const priced = kept.map((v) => v.priceMinor).filter((n): n is number => typeof n === 'number' && n > 0);
  const cmp = kept.map((v) => v.compareAtMinor).filter((n): n is number => typeof n === 'number' && n > 0);
  const keptIds = new Set(kept.map((v) => v.id));
  const costs = rows.filter((r) => keptIds.has(r.id)).map((r) => r.shopPriceMinor ?? r.avgCostMinor ?? 0);
  // The factory's B-grade line of this style is a listing of its own (the import makes it a separate draft): its pieces are the "Outlet" stock.
  const sibling = product.erpStyleCode
    ? await c.deps.db.product.findFirst({ where: { storeId: c.storeId, erpStyleCode: product.erpStyleCode, erpGrade: 'B', archivedAt: null, id: { not: id } }, select: { id: true } })
    : null;
  const bPieces = sibling ? Object.values(await cat.productStock(c.deps, c.who, sibling.id)).reduce((n, x) => n + x, 0) : 0;
  const assigned = readiness.sizeChart;
  const category = product.category;
  const categoryFaqs = category ? (await cat.listFaqs(c.deps, c.who, { scope: 'CATEGORY', categoryId: category.id })).filter((f) => f.isActive).length : 0;
  return {
    productId: id,
    status: product.status,
    nameEn: product.nameEn,
    nameBn: product.nameBn,
    erpName: product.nameEn,
    erpStyleCode: product.erpStyleCode,
    categoryId: product.category?.id ?? null,
    garmentKey: product.garmentType?.key ?? null,
    brandId: product.brandId,
    descriptionEn: product.descriptionEn,
    focusKeyword: product.focusKeyword,
    slug: naming.slug,
    seoTitleEn: naming.seoTitle.en.value,
    metaDescriptionEn: naming.metaDescription.en.value,
    colours,
    sizes,
    variants: kept.length,
    pieces: kept.reduce((n, v) => n + (stock[v.id] ?? 0), 0),
    costMinor: canPrices && costs.length ? Math.max(...costs) : null,
    priceMinor: priced.length ? Math.min(...priced) : null,
    compareAtMinor: cmp.length ? Math.min(...cmp) : null,
    spec,
    colourNames,
    tagIds: tagList.map((x) => x.id),
    faqs: faqList.filter((f) => !f.archived).map((f) => ({ id: f.id, q: f.questionEn, a: f.answerEn })),
    categoryFaqs,
    chart: { assignedId: assigned?.id ?? null, assignedName: assigned?.name ?? null, erp },
    bGradePieces: bPieces,
    video: !!(await cat.getProductVideo(c.deps, c.who, id)),
    photoCount: gallery?.length ?? 0,
    gallery,
  };
}
