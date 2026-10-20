// PR 90 — what the combo admin offers to pick from: the store's products (with their colours in the owner's colour
// order, their sizes and their lowest own price) and categories (with how many products each takes into combos), and
// the live preview of a combo that is not saved yet — worked out by the same price rule as everything else.
import { allow, nowOf, parse, setting, type CombosDeps, type Who } from './context';
import { roundingOf, toComboView, type ComboRow, type ComboView } from './combos-service';
import { colourPrice, productFacts } from './facts';
import { fixedComboInputSchema, pieceCountOf, windowFromDays, type FixedComboInput } from './model';

export interface ProductOption {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  categoryIds: string[];
  published: boolean;
  inCombos: boolean;
  priceMinor: number | null;
  colours: { id: string; key: string; nameEn: string; nameBn: string | null; hex: string; priceMinor: number | null }[];
  sizes: { id: string; label: string }[];
}

export interface CategoryOption {
  id: string;
  nameEn: string;
  nameBn: string | null;
  parentId: string | null;
  /** Published products with "Use in combos" ticked under this category (its own, a child's or a listing). */
  products: number;
}

export async function comboOptions(deps: CombosDeps, who: Who): Promise<{ products: ProductOption[]; categories: CategoryOption[] }> {
  await allow(deps, who, 'combos.read');
  const [rows, cats] = await Promise.all([
    deps.db.product.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { id: true }, orderBy: [{ sortRank: 'desc' }, { slug: 'asc' }] }),
    deps.db.category.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true, parentId: true }, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] }),
  ]);
  const facts = await productFacts(deps, who.storeId, rows.map((r) => r.id));
  const products: ProductOption[] = rows.flatMap((r) => {
    const p = facts.get(r.id);
    if (!p) return [];
    return [
      {
        id: p.id,
        slug: p.slug,
        nameEn: p.nameEn,
        nameBn: p.nameBn,
        categoryIds: p.categoryIds,
        published: p.published,
        inCombos: p.inCombos,
        priceMinor: colourPrice(p, null),
        colours: p.colours.map((c) => ({ id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex, priceMinor: colourPrice(p, c.id) })),
        sizes: p.sizes.map((s) => ({ id: s.id, label: s.label })),
      },
    ];
  });
  const categories = cats.map((c) => ({ ...c, products: products.filter((p) => p.published && p.inCombos && p.categoryIds.includes(c.id)).length }));
  return { products, categories };
}

/** The editor's live preview: the combo as it would be saved, priced by the one rule. Nothing is written. */
export async function previewCombo(deps: CombosDeps, who: Who, input: FixedComboInput): Promise<ComboView> {
  await allow(deps, who, 'combos.read');
  const d = parse(fixedComboInputSchema, input, 'combo');
  const [facts, rounding, timeZone] = await Promise.all([productFacts(deps, who.storeId, d.items.map((i) => i.productId)), roundingOf(deps, who.storeId), setting(deps, who.storeId, 'store.timeZone')]);
  const now = nowOf(deps);
  const row: ComboRow = {
    id: '00000000-0000-0000-0000-000000000000',
    slug: d.slug,
    nameEn: d.nameEn,
    nameBn: d.nameBn,
    descriptionEn: d.descriptionEn,
    descriptionBn: d.descriptionBn,
    type: d.type,
    status: 'DRAFT',
    ...windowFromDays(d.startsOn, d.endsOn, timeZone),
    autoApply: d.autoApply,
    sameColour: d.sameColour,
    isFeatured: d.isFeatured,
    listTemplateKey: d.listTemplateKey,
    pageTemplateKey: d.pageTemplateKey,
    bagTemplateKey: d.bagTemplateKey,
    setPriceMinor: d.setPriceMinor,
    pieceCount: pieceCountOf(d.items),
    setPhotoAssetId: null,
    autoRuleId: null,
    pieceKey: null,
    sortRank: 0,
    version: 0,
    updatedAt: now,
    items: d.items.map((i, n) => ({ position: n + 1, productId: i.productId, allowedColourIds: i.colourIds, allowedSizeIds: i.sizeIds, fixedVariantId: i.fixedVariantId, quantity: i.quantity, labelEn: i.labelEn, labelBn: i.labelBn })),
  };
  return toComboView(row, facts, { now, timeZone, rounding });
}
