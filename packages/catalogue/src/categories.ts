// PR 20 — the category tree with sub-categories, and the per-category garment type (per store, A4.2).
// - A category may sit inside another; the tree is at most `catalogue.categoryMaxDepth` levels deep and can never loop.
// - The garment type is set on a category and inherited by its sub-categories unless one sets its own; the size charts
//   (PR 27), the measurement line and the size help read it.
// - The link (slug) is unique in the store and never one of `catalogue.reservedSlugs` (C12.1: reserved first segments
//   are never category links). A category lives at `/<slug>`; a changed link forwards from the old one (no chains).
// - Nothing is deleted: a category is archived, and only when no live sub-category or product is in it.
// The template key (PR 52) and the "was" price source (PR 38) belong to their own PRs and are not changed here.
import { z } from 'zod';
import { dictionaryKeySchema } from '@extas/settings';
import { emitCacheEvent } from '@extas/cache/events';
import { allow, assertImage, changed, found, logChange, parse, setting, slugOptions, TX, type CatalogueDeps, type Tx, type Who } from './context';
import { CatalogueError } from './errors';
import { forwardingElsewhere, moveLink } from './redirects';
import { slugify } from './text';

const text = (max: number) => z.string().trim().min(1).max(max);
const fields = {
  nameEn: text(80),
  nameBn: text(80).nullable().optional(),
  introEn: text(2000).nullable().optional(),
  introBn: text(2000).nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  garmentTypeId: z.uuid().nullable().optional(),
  imageAssetId: z.uuid().nullable().optional(),
  sortOrder: z.int().min(0).max(100_000).optional(),
  isVisible: z.boolean().optional(),
};
export const categoryInput = z.object({ slug: dictionaryKeySchema.optional(), ...fields }).strict();
export const categoryPatch = z.object({ ...fields, slug: dictionaryKeySchema.optional(), nameEn: fields.nameEn.optional(), archived: z.boolean().optional() }).strict();
export type CategoryInput = z.input<typeof categoryInput>;
export type CategoryPatch = z.input<typeof categoryPatch>;

export interface CategoryNode {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  introEn: string | null;
  introBn: string | null;
  parentId: string | null;
  /** 1 = top level. */
  depth: number;
  /** Names from the top, e.g. ["Polos", "Ralph Lauren polo"]. */
  pathEn: string[];
  pathBn: string[];
  /** The page's path (`/<slug>`). */
  url: string;
  garmentTypeId: string | null;
  /** Own garment type, or the nearest ancestor's (PR 20). */
  effectiveGarmentType: { id: string; key: string; inherited: boolean } | null;
  imageAssetId: string | null;
  sortOrder: number;
  isVisible: boolean;
  archived: boolean;
  /** Live products whose main category this is. */
  products: number;
  children: CategoryNode[];
}

type Row = Awaited<ReturnType<typeof rowsOf>>[number];

function rowsOf(tx: Tx | CatalogueDeps['db'], storeId: number) {
  return tx.category.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { garmentType: { select: { id: true, key: true, archivedAt: true } }, _count: { select: { products: { where: { archivedAt: null } } } } },
  });
}

export const categoryUrl = (slug: string) => `/${slug}`;

/** Builds the tree (archived rows only when asked; an archived parent hides its subtree). */
export function buildTree(rows: Row[], includeArchived: boolean): CategoryNode[] {
  const byParent = new Map<string | null, Row[]>();
  for (const r of rows) {
    if (!includeArchived && r.archivedAt) continue;
    const k = r.parentId ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), r]);
  }
  const walk = (parent: string | null, depth: number, pathEn: string[], pathBn: string[], inherited: CategoryNode['effectiveGarmentType']): CategoryNode[] =>
    (byParent.get(parent) ?? []).map((r) => {
      const own = r.garmentType && !r.garmentType.archivedAt ? { id: r.garmentType.id, key: r.garmentType.key, inherited: false } : null;
      const eff = own ?? (inherited ? { ...inherited, inherited: true } : null);
      const pe = [...pathEn, r.nameEn];
      const pb = [...pathBn, r.nameBn ?? r.nameEn];
      return {
        id: r.id,
        slug: r.slug,
        nameEn: r.nameEn,
        nameBn: r.nameBn,
        introEn: r.introEn,
        introBn: r.introBn,
        parentId: r.parentId,
        depth,
        pathEn: pe,
        pathBn: pb,
        url: categoryUrl(r.slug),
        garmentTypeId: r.garmentTypeId,
        effectiveGarmentType: eff,
        imageAssetId: r.imageAssetId,
        sortOrder: r.sortOrder,
        isVisible: r.isVisible,
        archived: r.archivedAt != null,
        products: r._count.products,
        children: walk(r.id, depth + 1, pe, pb, eff),
      };
    });
  return walk(null, 1, [], [], null);
}

export function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export async function categoryTree(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<CategoryNode[]> {
  await allow(deps, who, 'catalogue.read');
  return buildTree(await rowsOf(deps.db, who.storeId), Boolean(opts.includeArchived));
}

/** One category with its path and effective garment type. */
export async function getCategory(deps: CatalogueDeps, who: Who, id: string): Promise<CategoryNode> {
  await allow(deps, who, 'catalogue.read');
  return found(flatten(buildTree(await rowsOf(deps.db, who.storeId), true)).find((n) => n.id === id), 'category');
}

/** The garment type a category's products are made as: its own, else the nearest ancestor's. */
export async function effectiveGarmentTypeOf(db: CatalogueDeps['db'] | Tx, storeId: number, categoryId: string | null): Promise<{ id: string; key: string; nameEn: string; nameBn: string } | null> {
  let id = categoryId;
  for (let guard = 0; id && guard < 64; guard++) {
    const c = await db.category.findFirst({ where: { id, storeId }, select: { parentId: true, garmentType: { select: { id: true, key: true, nameEn: true, nameBn: true, archivedAt: true } } } });
    if (!c) return null;
    if (c.garmentType && !c.garmentType.archivedAt) return { id: c.garmentType.id, key: c.garmentType.key, nameEn: c.garmentType.nameEn, nameBn: c.garmentType.nameBn };
    id = c.parentId;
  }
  return null;
}

/** Depth of a category (1 = top) and the height of its subtree (1 = no children). */
function measure(rows: Row[], id: string | null): { depth: number; ancestors: Set<string> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ancestors = new Set<string>();
  let depth = 0;
  for (let cur = id; cur; cur = byId.get(cur)?.parentId ?? null) {
    if (ancestors.has(cur)) break;
    ancestors.add(cur);
    depth++;
  }
  return { depth, ancestors };
}

function height(rows: Row[], id: string): number {
  const kids = rows.filter((r) => r.parentId === id && !r.archivedAt);
  return 1 + (kids.length ? Math.max(...kids.map((k) => height(rows, k.id))) : 0);
}

/**
 * A category link must not be reserved, must not be another category's, and must not be an old link that forwards to
 * another page. `self` is the category being renamed: its own old links may come back.
 */
async function checkSlug(deps: CatalogueDeps, who: Who, tx: Tx, slug: string, self?: { id: string; slug: string }) {
  const reserved = await setting(deps, who, 'catalogue.reservedSlugs');
  if (reserved.includes(slug)) throw new CatalogueError('SLUG_RESERVED', "this word starts other pages' links", ['slug']);
  const other = await tx.category.findUnique({ where: { storeId_slug: { storeId: who.storeId, slug } } });
  if (other && other.id !== self?.id) throw new CatalogueError('SLUG_TAKEN', 'another category has this link (archived ones keep theirs)', ['slug']);
  const elsewhere = await forwardingElsewhere(tx, who.storeId, categoryUrl(slug), self ? categoryUrl(self.slug) : null);
  if (elsewhere) throw new CatalogueError('SLUG_TAKEN', 'this link is an old link that forwards to another page', [`→ ${elsewhere}`]);
}

/** The parent must exist, be live, not be the category itself or inside it, and keep the tree within `maxDepth`. */
function checkParent(rows: Row[], parentId: string | null | undefined, selfId: string | null, maxDepth: number): void {
  const own = selfId ? height(rows, selfId) : 1;
  if (!parentId) {
    if (own > maxDepth) tooDeep(maxDepth);
    return;
  }
  const parent = rows.find((r) => r.id === parentId);
  if (!parent) throw new CatalogueError('NOT_FOUND', 'no such parent category', ['parentId']);
  if (parent.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the parent category is archived', ['parentId']);
  const { depth, ancestors } = measure(rows, parentId);
  if (selfId && ancestors.has(selfId)) throw new CatalogueError('CATEGORY_CYCLE', 'a category cannot sit inside itself', ['parentId']);
  if (depth + own > maxDepth) tooDeep(maxDepth);
}

function tooDeep(maxDepth: number): never {
  throw new CatalogueError('CATEGORY_TOO_DEEP', 'the tree would be too deep', [`maxDepth: ${maxDepth}`]);
}

async function checkGarmentType(tx: Tx, storeId: number, id: string | null | undefined) {
  if (!id) return;
  const g = await tx.garmentType.findFirst({ where: { id, storeId } });
  if (!g) throw new CatalogueError('NOT_FOUND', 'no such garment type', ['garmentTypeId']);
  if (g.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the garment type is archived', ['garmentTypeId']);
}

export async function createCategory(deps: CatalogueDeps, who: Who, input: CategoryInput): Promise<CategoryNode> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(categoryInput, input, 'category');
  const slug = d.slug ?? slugify(d.nameEn, await slugOptions(deps, who));
  if (!slug) throw new CatalogueError('INVALID_INPUT', 'give the category an English name or a link', ['slug']);
  await assertImage(deps.db, who.storeId, d.imageAssetId, 'imageAssetId');
  const maxDepth = await setting(deps, who, 'catalogue.categoryMaxDepth');
  const id = await deps.db.$transaction(async (tx) => {
    await checkSlug(deps, who, tx, slug);
    const rows = await rowsOf(tx, who.storeId);
    checkParent(rows, d.parentId, null, maxDepth);
    await checkGarmentType(tx, who.storeId, d.garmentTypeId);
    let sortOrder = d.sortOrder;
    if (sortOrder === undefined) {
      const siblings = rows.filter((r) => (r.parentId ?? null) === (d.parentId ?? null));
      sortOrder = siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0;
    }
    const row = await tx.category.create({
      data: {
        storeId: who.storeId,
        slug,
        nameEn: d.nameEn,
        nameBn: d.nameBn ?? null,
        introEn: d.introEn ?? null,
        introBn: d.introBn ?? null,
        parentId: d.parentId ?? null,
        garmentTypeId: d.garmentTypeId ?? null,
        imageAssetId: d.imageAssetId ?? null,
        sortOrder,
        isVisible: d.isVisible ?? false,
      },
    });
    await logChange(tx, who, 'category.create', 'Category', row.id, null, { slug, nameEn: d.nameEn, parentId: row.parentId, garmentTypeId: row.garmentTypeId, isVisible: row.isVisible });
    return row.id;
  }, TX);
  // PR 602: a new or changed category changes the lists (its page, its parent's)
  emitCacheEvent({ kind: 'category', storeId: who.storeId, categoryIds: [id] });
  return getCategory(deps, who, id);
}

export async function updateCategory(deps: CatalogueDeps, who: Who, id: string, patch: CategoryPatch): Promise<CategoryNode> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(categoryPatch, patch, 'category');
  await assertImage(deps.db, who.storeId, d.imageAssetId, 'imageAssetId');
  const [maxDepth, statusCode] = await Promise.all([setting(deps, who, 'catalogue.categoryMaxDepth'), setting(deps, who, 'naming.redirectStatusCode')]);
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const rows = await rowsOf(tx, who.storeId);
    const cur = found(rows.find((r) => r.id === id), 'category');
    if (d.slug !== undefined && d.slug !== cur.slug) await checkSlug(deps, who, tx, d.slug, { id: cur.id, slug: cur.slug });
    if (d.parentId !== undefined && d.parentId !== cur.parentId) checkParent(rows, d.parentId, cur.id, maxDepth);
    if (d.garmentTypeId !== undefined) await checkGarmentType(tx, who.storeId, d.garmentTypeId);
    if (archived === true && !cur.archivedAt) {
      const kids = rows.filter((r) => r.parentId === cur.id && !r.archivedAt).length;
      if (kids || cur._count.products) throw new CatalogueError('CATEGORY_NOT_EMPTY', 'move its sub-categories and products first', [`subCategories: ${kids}`, `products: ${cur._count.products}`]);
    }
    if (archived === false && cur.archivedAt && cur.parentId) {
      const p = rows.find((r) => r.id === cur.parentId);
      if (p?.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'restore the parent category first', ['parentId']);
    }
    const before = {
      slug: cur.slug,
      nameEn: cur.nameEn,
      nameBn: cur.nameBn,
      introEn: cur.introEn,
      introBn: cur.introBn,
      parentId: cur.parentId,
      garmentTypeId: cur.garmentTypeId,
      imageAssetId: cur.imageAssetId,
      sortOrder: cur.sortOrder,
      isVisible: cur.isVisible,
      archivedAt: cur.archivedAt,
    };
    const next = {
      ...before,
      ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null,
    } as typeof before;
    const diff = changed(before, next);
    if (!Object.keys(diff.after).length) return;
    await tx.category.update({ where: { id: cur.id }, data: next });
    if (next.slug !== cur.slug) await moveLink(tx, who, categoryUrl(cur.slug), categoryUrl(next.slug), 'category-slug', statusCode, now);
    const action = archived === true ? 'category.archive' : archived === false && cur.archivedAt ? 'category.restore' : d.parentId !== undefined && d.parentId !== cur.parentId ? 'category.move' : 'category.update';
    await logChange(tx, who, action, 'Category', cur.id, diff.before, diff.after);
  }, TX);
  emitCacheEvent({ kind: 'category', storeId: who.storeId, categoryIds: [id] });
  return getCategory(deps, who, id);
}
