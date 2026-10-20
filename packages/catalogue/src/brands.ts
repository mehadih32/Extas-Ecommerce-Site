// PR 590 — brands. Owner decision 19 Oct 12:07: brand names stay. Every product has a real brand field: the brand it
// actually is (Lacoste, Ralph Lauren …) or, when empty, the store's own label. The own label is the store's Brand row
// marked `isOwnLabel` (at most one live per store); without one, the store's name setting stands in (owner data, read
// at run time, never stored in code). The brand feeds the brand line, structured data and the feeds.
import { z } from 'zod';
import { dictionaryKeySchema } from '@extas/settings';
import { allow, assertImage, changed, found, keyFrom, logChange, parse, TX, type CatalogueDeps, type Db, type Who } from './context';
import { CatalogueError } from './errors';

const fields = {
  name: z.string().trim().min(1).max(80),
  isOwnLabel: z.boolean().optional(),
  logoAssetId: z.uuid().nullable().optional(),
};
export const brandInput = z.object({ slug: dictionaryKeySchema.optional(), ...fields }).strict();
export const brandPatch = z.object({ ...fields, name: fields.name.optional(), archived: z.boolean().optional() }).strict();
export type BrandInput = z.input<typeof brandInput>;
export type BrandPatch = z.input<typeof brandPatch>;

export interface BrandView {
  id: string;
  slug: string;
  name: string;
  isOwnLabel: boolean;
  logoAssetId: string | null;
  archived: boolean;
  products: number;
}

type BrandRow = { id: string; slug: string; name: string; isOwnLabel: boolean; logoAssetId: string | null; archivedAt: Date | null };
const view = (b: BrandRow, products = 0): BrandView => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  isOwnLabel: b.isOwnLabel,
  logoAssetId: b.logoAssetId,
  archived: b.archivedAt != null,
  products,
});

const liveProducts = (db: Db, storeId: number, brandId: string) => db.product.count({ where: { storeId, brandId, archivedAt: null } });

export async function listBrands(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<BrandView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.brand.findMany({
    where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ isOwnLabel: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
  });
  return rows.map((r) => view(r, r._count.products));
}

async function assertOneOwnLabel(db: Db, storeId: number, exceptId?: string) {
  const other = await db.brand.findFirst({ where: { storeId, isOwnLabel: true, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (other) throw new CatalogueError('CONFLICT', 'the store already has an own-label brand', [`ownLabel: ${other.slug}`]);
}

export async function createBrand(deps: CatalogueDeps, who: Who, input: BrandInput): Promise<BrandView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(brandInput, input, 'brand');
  const slug = d.slug ?? (await keyFrom(deps, who, d.name));
  if (!slug) throw new CatalogueError('INVALID_INPUT', 'give the brand an English name or a slug', ['slug']);
  await assertImage(deps.db, who.storeId, d.logoAssetId, 'logoAssetId');
  return deps.db.$transaction(async (tx) => {
    if (await tx.brand.findUnique({ where: { storeId_slug: { storeId: who.storeId, slug } } })) throw new CatalogueError('CONFLICT', 'a brand with this slug exists', ['slug']);
    if (d.isOwnLabel) await assertOneOwnLabel(tx, who.storeId);
    const row = await tx.brand.create({ data: { storeId: who.storeId, slug, name: d.name, isOwnLabel: d.isOwnLabel ?? false, logoAssetId: d.logoAssetId ?? null } });
    await logChange(tx, who, 'brand.create', 'Brand', row.id, null, view(row));
    return view(row);
  }, TX);
}

export async function updateBrand(deps: CatalogueDeps, who: Who, id: string, patch: BrandPatch): Promise<BrandView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(brandPatch, patch, 'brand');
  await assertImage(deps.db, who.storeId, d.logoAssetId, 'logoAssetId');
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.brand.findFirst({ where: { id, storeId: who.storeId } }), 'brand');
    const next = {
      name: d.name ?? cur.name,
      isOwnLabel: d.isOwnLabel ?? cur.isOwnLabel,
      logoAssetId: d.logoAssetId === undefined ? cur.logoAssetId : d.logoAssetId,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? deps.now?.() ?? new Date()) : null,
    };
    if (next.isOwnLabel && !next.archivedAt) await assertOneOwnLabel(tx, who.storeId, cur.id);
    if (archived === true && !cur.archivedAt) {
      const n = await liveProducts(tx, who.storeId, cur.id);
      if (n) throw new CatalogueError('CONFLICT', 'live products carry this brand', [`products: ${n}`]);
    }
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (Object.keys(diff.after).length) {
      await tx.brand.update({ where: { id: cur.id }, data: next });
      await logChange(tx, who, archived === true ? 'brand.archive' : 'brand.update', 'Brand', cur.id, diff.before, diff.after);
    }
    const row = await tx.brand.findUniqueOrThrow({ where: { id: cur.id } });
    return view(row, await liveProducts(tx, who.storeId, row.id));
  }, TX);
}

/** The brand a product is sold under: its own brand row, else the own-label brand, else the store's name. */
export interface EffectiveBrand {
  id: string | null;
  name: string;
  isOwnLabel: boolean;
}

export async function effectiveBrand(db: Db, storeId: number, brandId: string | null, storeName: string | null): Promise<EffectiveBrand> {
  if (brandId) {
    const b = await db.brand.findFirst({ where: { id: brandId, storeId }, select: { id: true, name: true, isOwnLabel: true } });
    if (b) return { id: b.id, name: b.name, isOwnLabel: b.isOwnLabel };
  }
  const own = await db.brand.findFirst({ where: { storeId, isOwnLabel: true, archivedAt: null }, select: { id: true, name: true } });
  return own ? { id: own.id, name: own.name, isOwnLabel: true } : { id: null, name: storeName ?? '', isOwnLabel: true };
}
