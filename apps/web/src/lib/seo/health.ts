// S11 · PR 237 — the SEO health list (Website › SEO › SEO health): what is missing, page by page, from what the shop
// really has. A published product: no English description, no photo, photos without a description (alt text). A shown
// collection: no text under its grid, no search line of its own, no style in it. Pure (`healthRows`) plus one read of
// the database (`seoHealth`); nothing is changed here — each row links to where it is fixed.
import type { PrismaClient } from '@extas/db/client';

export const HEALTH_ISSUES = ['noDescription', 'noPhoto', 'photoNoAlt', 'noText', 'noSearchLine', 'noStyles'] as const;
export type HealthIssue = (typeof HEALTH_ISSUES)[number];

export interface HealthProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  photos: number;
  photosNoAlt: number;
}

export interface HealthCollection {
  slug: string;
  name: string;
  /** Its own English text under the grid and search line (`category.seo`), or null. */
  text: string | null;
  searchLine: string | null;
  styles: number;
}

export interface HealthRow {
  kind: 'product' | 'collection';
  key: string;
  name: string;
  /** The shop address (without /bn). */
  path: string;
  /** Where it is fixed in the admin. */
  fix: string;
  issues: HealthIssue[];
  /** Photos without a description, for the words. */
  photosNoAlt: number;
}

const blank = (s: string | null | undefined) => !s?.trim();

/** Every page with at least one thing missing (products first, then collections), in the order given. */
export function healthRows(products: readonly HealthProduct[], collections: readonly HealthCollection[], productPrefix: string): HealthRow[] {
  const rows: HealthRow[] = [];
  for (const p of products) {
    const issues: HealthIssue[] = [];
    if (blank(p.description)) issues.push('noDescription');
    if (p.photos < 1) issues.push('noPhoto');
    if (p.photosNoAlt > 0) issues.push('photoNoAlt');
    if (issues.length)
      rows.push({
        kind: 'product',
        key: `p:${p.id}`,
        name: p.name,
        path: `${productPrefix.replace(/\/$/, '')}/${p.slug}`,
        fix: `/admin/products/${p.id}`,
        issues,
        photosNoAlt: p.photosNoAlt,
      });
  }
  for (const c of collections) {
    const issues: HealthIssue[] = [];
    if (c.styles < 1) issues.push('noStyles');
    if (blank(c.text)) issues.push('noText');
    if (blank(c.searchLine)) issues.push('noSearchLine');
    if (issues.length)
      rows.push({ kind: 'collection', key: `c:${c.slug}`, name: c.name, path: `/collections/${c.slug}`, fix: '/admin/website/seo/categories', issues, photosNoAlt: 0 });
  }
  return rows;
}

/** How many pages have each issue. */
export function healthCounts(rows: readonly HealthRow[]): Record<HealthIssue, number> {
  const out = Object.fromEntries(HEALTH_ISSUES.map((i) => [i, 0])) as Record<HealthIssue, number>;
  for (const r of rows) for (const i of r.issues) out[i] += 1;
  return out;
}

type CategorySeo = Record<string, { text?: { en: string }; meta?: { en: string } }> | null;

/** The published products and shown collections of a store, read once, with what each is missing. */
export async function seoHealth(
  db: PrismaClient,
  storeId: number,
  categorySeo: CategorySeo,
  productPrefix: string,
): Promise<{ rows: HealthRow[]; products: number; collections: number }> {
  const [products, media, trueShots, cats, listed] = await Promise.all([
    db.product.findMany({
      where: { storeId, status: 'PUBLISHED', isDemo: false, archivedAt: null },
      select: { id: true, slug: true, nameEn: true, descriptionEn: true, categoryId: true },
      orderBy: [{ nameEn: 'asc' }],
    }),
    db.productMedia.findMany({
      where: { storeId, archivedAt: null, role: { not: 'VIDEO' }, product: { status: 'PUBLISHED', archivedAt: null }, asset: { archivedAt: null } },
      select: { productId: true, asset: { select: { altEn: true } } },
    }),
    // the true-colour photo of a colour counts as a photo too (PR 232 writes its description as well)
    db.productColour.findMany({
      where: { storeId, archivedAt: null, trueColourAssetId: { not: null }, product: { status: 'PUBLISHED', archivedAt: null } },
      select: { productId: true, trueColourAssetId: true },
    }),
    db.category.findMany({
      where: { storeId, isVisible: true, archivedAt: null },
      select: { id: true, slug: true, nameEn: true, parentId: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    }),
    db.categoryProduct.findMany({ where: { storeId, isVisible: true, product: { status: 'PUBLISHED', archivedAt: null } }, select: { categoryId: true, productId: true } }),
  ]);
  const trueAssets = new Map(
    (await db.mediaAsset.findMany({ where: { id: { in: trueShots.map((x) => x.trueColourAssetId as string) }, archivedAt: null }, select: { id: true, altEn: true } })).map((a) => [
      a.id,
      a.altEn,
    ]),
  );
  const photos = new Map<string, { all: number; noAlt: number }>();
  const count = (productId: string, alt: string | null) => {
    const p = photos.get(productId) ?? { all: 0, noAlt: 0 };
    p.all += 1;
    if (blank(alt)) p.noAlt += 1;
    photos.set(productId, p);
  };
  for (const m of media) count(m.productId, m.asset.altEn);
  for (const x of trueShots) if (trueAssets.has(x.trueColourAssetId as string)) count(x.productId, trueAssets.get(x.trueColourAssetId as string) ?? null);
  // a collection's styles: its own (main category or listed in it) and those of its sub-collections, each once
  const own = new Map<string, Set<string>>();
  const add = (cat: string | null, product: string) => {
    if (cat) own.set(cat, (own.get(cat) ?? new Set()).add(product));
  };
  for (const p of products) add(p.categoryId, p.id);
  for (const l of listed) add(l.categoryId, l.productId);
  const under = (id: string): Set<string> => new Set([...(own.get(id) ?? []), ...cats.filter((k) => k.parentId === id).flatMap((k) => [...under(k.id)])]);
  const styles = (id: string) => under(id).size;
  const rows = healthRows(
    products.map((p) => ({ id: p.id, slug: p.slug, name: p.nameEn, description: p.descriptionEn, photos: photos.get(p.id)?.all ?? 0, photosNoAlt: photos.get(p.id)?.noAlt ?? 0 })),
    cats.map((k) => ({ slug: k.slug, name: k.nameEn, text: categorySeo?.[k.slug]?.text?.en ?? null, searchLine: categorySeo?.[k.slug]?.meta?.en ?? null, styles: styles(k.id) })),
    productPrefix,
  );
  return { rows, products: products.length, collections: cats.length };
}
