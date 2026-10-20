// PR 32 — collections and tags, including seasonal ones (Blueprint C12.1 URL map `/collections/<slug>`; PR 246/530:
// seasonal pages are permanent and re-used every year — live and ended are states, never deletion; App. B #15:
// Eid, winter, Puja and a "new in" evergreen page).
// - A collection is MANUAL (the owner picks the products and their order), SEASONAL (the same, plus a season from
//   `catalogue.collections.seasons` and dates that make it live) or RULE (products follow a rule: tags, categories,
//   in stock only). Its page lives at `catalogue.collections.pathPrefix` + "/" + slug; a changed link forwards (301).
// - A tag is a short label on products (Bestseller, New …). A product carries at most `catalogue.tags.maxPerProduct`.
// - Collections and tags are archived, never deleted. Taking a product out of a collection or a tag off a product
//   removes only that link; the audit log keeps it (who, when, which), so it can be put back.
import { z } from 'zod';
import { Prisma } from '@extas/db/client';
import { dictionaryKeySchema, type Dictionary } from '@extas/settings';
import { allow, changed, found, keyFrom, logChange, parse, setting, slugOptions, TX, type CatalogueDeps, type Db, type Tx, type Who } from './context';
import { CatalogueError } from './errors';
import { moveLink } from './redirects';
import { slugify } from './text';

// ---------------------------------------------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------------------------------------------

export const collectionRuleSchema = z
  .object({
    /** Products with any of these tags (slugs). */
    tags: z.array(dictionaryKeySchema).max(50).optional(),
    /** Products in any of these categories (or their sub-categories). */
    categoryIds: z.array(z.uuid()).max(50).optional(),
    inStockOnly: z.boolean().optional(),
  })
  .strict()
  .refine((r) => Boolean(r.tags?.length) || Boolean(r.categoryIds?.length), { message: 'a rule needs at least one tag or category' });
export type CollectionRule = z.output<typeof collectionRuleSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const when = z.iso.datetime({ offset: true }).nullable().optional();
const fields = {
  nameEn: text(80),
  nameBn: text(80).nullable().optional(),
  kind: z.enum(['MANUAL', 'SEASONAL', 'RULE']),
  season: dictionaryKeySchema.nullable().optional(),
  rule: collectionRuleSchema.nullable().optional(),
  startsAt: when,
  endsAt: when,
};
export const collectionInput = z.object({ slug: dictionaryKeySchema.optional(), ...fields }).strict();
export const collectionPatch = z
  .object({ ...fields, slug: dictionaryKeySchema.optional(), nameEn: fields.nameEn.optional(), kind: fields.kind.optional(), archived: z.boolean().optional() })
  .strict();
export type CollectionInput = z.input<typeof collectionInput>;
export type CollectionPatch = z.input<typeof collectionPatch>;

/** Live now, waiting for its start, ended (kept for next year), archived, or always on (no dates). */
export type CollectionState = 'always' | 'scheduled' | 'live' | 'ended' | 'archived';

export function collectionState(c: { startsAt: Date | null; endsAt: Date | null; archivedAt: Date | null }, now: Date): CollectionState {
  if (c.archivedAt) return 'archived';
  if (c.endsAt && c.endsAt <= now) return 'ended';
  if (c.startsAt && c.startsAt > now) return 'scheduled';
  return c.startsAt || c.endsAt ? 'live' : 'always';
}

export interface CollectionView {
  id: string;
  slug: string;
  path: string;
  nameEn: string;
  nameBn: string | null;
  kind: 'MANUAL' | 'SEASONAL' | 'RULE';
  season: { key: string; en: string; bn: string } | null;
  rule: CollectionRule | null;
  startsAt: string | null;
  endsAt: string | null;
  state: CollectionState;
  /** Products in it now (picked, or matching the rule). */
  products: number;
  archived: boolean;
  updatedAt: string;
}

/** Where the season key and the rule are kept (Collection.rules, Json). */
interface StoredRules {
  season?: string | null;
  rule?: CollectionRule | null;
}

function readRules(json: Prisma.JsonValue | null): StoredRules {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  const rule = collectionRuleSchema.safeParse(o.rule);
  return { season: typeof o.season === 'string' ? o.season : null, rule: rule.success ? rule.data : null };
}

/** Live links only: a product taken out of a collection, or a tag taken off, keeps its archived row (hard rule 3). */
const LIVE = { archivedAt: null } as const;
const collectionInclude = { _count: { select: { products: { where: LIVE } } } } as const;
type CollectionRow = Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>;

async function collectionSettings(deps: CatalogueDeps, who: Who) {
  const [prefix, seasons, maxProducts] = await Promise.all([setting(deps, who, 'catalogue.collections.pathPrefix'), setting(deps, who, 'catalogue.collections.seasons'), setting(deps, who, 'catalogue.collections.maxProducts')]);
  return { prefix, seasons, maxProducts };
}

export const collectionPath = (prefix: string, slug: string) => `${prefix.replace(/\/+$/, '')}/${slug}`;

function viewOf(c: CollectionRow, prefix: string, seasons: Dictionary, now: Date, ruleCount: number | null): CollectionView {
  const r = readRules(c.rules);
  const season = r.season ? (seasons.find((s) => s.key === r.season) ?? { key: r.season, en: r.season, bn: r.season }) : null;
  return {
    id: c.id,
    slug: c.slug,
    path: collectionPath(prefix, c.slug),
    nameEn: c.nameEn,
    nameBn: c.nameBn,
    kind: c.kind,
    season,
    rule: r.rule ?? null,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    state: collectionState(c, now),
    products: c.kind === 'RULE' ? (ruleCount ?? 0) : c._count.products,
    archived: c.archivedAt != null,
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Every category id under these (themselves included). */
async function withDescendants(db: Db, storeId: number, ids: string[]): Promise<string[]> {
  const all = await db.category.findMany({ where: { storeId }, select: { id: true, parentId: true } });
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return [...out];
}

async function ruleWhere(db: Db, storeId: number, rule: CollectionRule): Promise<Prisma.ProductWhereInput> {
  const or: Prisma.ProductWhereInput[] = [];
  if (rule.tags?.length) or.push({ id: { in: (await db.productTag.findMany({ where: { storeId, archivedAt: null, tag: { slug: { in: rule.tags }, archivedAt: null } }, select: { productId: true } })).map((t) => t.productId) } });
  if (rule.categoryIds?.length) or.push({ categoryId: { in: await withDescendants(db, storeId, rule.categoryIds) } });
  return { storeId, archivedAt: null, OR: or, ...(rule.inStockOnly ? { inStock: true } : {}) };
}

export async function listCollections(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<CollectionView[]> {
  await allow(deps, who, 'catalogue.read');
  const { prefix, seasons } = await collectionSettings(deps, who);
  const now = deps.now?.() ?? new Date();
  const rows = await deps.db.collection.findMany({
    where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    include: collectionInclude,
    orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
  });
  const out: CollectionView[] = [];
  for (const c of rows) {
    const rule = c.kind === 'RULE' ? readRules(c.rules).rule : null;
    out.push(viewOf(c, prefix, seasons, now, rule ? await deps.db.product.count({ where: await ruleWhere(deps.db, who.storeId, rule) }) : null));
  }
  return out;
}

export interface CollectionProductView {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  inStock: boolean;
  position: number;
}

export interface CollectionDetail extends CollectionView {
  items: CollectionProductView[];
}

export async function getCollection(deps: CatalogueDeps, who: Who, id: string): Promise<CollectionDetail> {
  await allow(deps, who, 'catalogue.read');
  const { prefix, seasons, maxProducts } = await collectionSettings(deps, who);
  const c = found(await deps.db.collection.findFirst({ where: { id, storeId: who.storeId }, include: collectionInclude }), 'collection');
  const pick = { id: true, slug: true, nameEn: true, nameBn: true, status: true, inStock: true, archivedAt: true } as const;
  let items: CollectionProductView[];
  const rule = c.kind === 'RULE' ? readRules(c.rules).rule : null;
  if (rule) {
    const ps = await deps.db.product.findMany({ where: await ruleWhere(deps.db, who.storeId, rule), select: pick, orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }], take: maxProducts });
    items = ps.map((p, i) => ({ id: p.id, slug: p.slug, nameEn: p.nameEn, nameBn: p.nameBn, status: p.status, inStock: p.inStock, position: i }));
  } else {
    const links = await deps.db.collectionProduct.findMany({ where: { storeId: who.storeId, collectionId: c.id, ...LIVE }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    const ps = await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: links.map((l) => l.productId) } }, select: pick });
    const by = new Map(ps.map((p) => [p.id, p]));
    items = links.flatMap((l) => {
      const p = by.get(l.productId);
      return p && !p.archivedAt ? [{ id: p.id, slug: p.slug, nameEn: p.nameEn, nameBn: p.nameBn, status: p.status, inStock: p.inStock, position: l.position }] : [];
    });
  }
  return { ...viewOf(c, prefix, seasons, deps.now?.() ?? new Date(), items.length), items };
}

function checkShape(d: { kind?: string; season?: string | null; rule?: CollectionRule | null; startsAt?: string | null; endsAt?: string | null }, seasons: Dictionary) {
  if (d.kind === 'SEASONAL' && !d.season) throw new CatalogueError('INVALID_INPUT', 'a seasonal collection needs its season', ['season']);
  if (d.kind !== 'SEASONAL' && d.season) throw new CatalogueError('INVALID_INPUT', 'only a seasonal collection has a season', ['season']);
  if (d.season && !seasons.some((s) => s.key === d.season)) throw new CatalogueError('UNKNOWN_KEY', 'not in the season dictionary', [`season: ${d.season}`]);
  if (d.kind === 'RULE' && !d.rule) throw new CatalogueError('INVALID_INPUT', 'a rule collection needs its rule', ['rule']);
  if (d.kind !== 'RULE' && d.rule) throw new CatalogueError('INVALID_INPUT', 'only a rule collection has a rule', ['rule']);
  if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) throw new CatalogueError('INVALID_INPUT', 'the end must be after the start', ['endsAt']);
}

async function checkRuleRefs(tx: Tx, storeId: number, rule: CollectionRule | null | undefined) {
  if (!rule?.categoryIds?.length) return;
  const n = await tx.category.count({ where: { storeId, id: { in: rule.categoryIds } } });
  if (n !== new Set(rule.categoryIds).size) throw new CatalogueError('NOT_FOUND', 'no such category', ['rule.categoryIds']);
}

async function slugFree(tx: Tx, storeId: number, slug: string, exceptId?: string) {
  const twin = await tx.collection.findUnique({ where: { storeId_slug: { storeId, slug } }, select: { id: true } });
  if (twin && twin.id !== exceptId) throw new CatalogueError('SLUG_TAKEN', 'another collection has this link', [`slug: ${slug}`]);
}

/** Collection.rules: the season key and the rule, or SQL NULL when there is neither. */
const rulesData = (season: string | null | undefined, rule: CollectionRule | null | undefined) => ({ rules: season || rule ? ({ season: season ?? null, rule: rule ?? null } as Prisma.InputJsonValue) : Prisma.DbNull });

export async function createCollection(deps: CatalogueDeps, who: Who, input: CollectionInput): Promise<CollectionDetail> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(collectionInput, input, 'collection');
  const { seasons } = await collectionSettings(deps, who);
  checkShape(d, seasons);
  const slug = d.slug ?? (await keyFrom(deps, who, d.nameEn));
  if (!slug) throw new CatalogueError('INVALID_INPUT', 'give the collection a link', ['slug']);
  const id = await deps.db.$transaction(async (tx) => {
    await slugFree(tx, who.storeId, slug);
    await checkRuleRefs(tx, who.storeId, d.rule);
    const row = await tx.collection.create({
      data: {
        storeId: who.storeId,
        slug,
        nameEn: d.nameEn,
        nameBn: d.nameBn ?? null,
        kind: d.kind,
        ...rulesData(d.season, d.rule),
        startsAt: d.startsAt ? new Date(d.startsAt) : null,
        endsAt: d.endsAt ? new Date(d.endsAt) : null,
      },
    });
    await logChange(tx, who, 'collection.create', 'Collection', row.id, null, { slug, nameEn: row.nameEn, kind: row.kind, rules: row.rules, startsAt: row.startsAt, endsAt: row.endsAt });
    return row.id;
  }, TX);
  return getCollection(deps, who, id);
}

export async function updateCollection(deps: CatalogueDeps, who: Who, id: string, patch: CollectionPatch): Promise<CollectionDetail> {
  await allow(deps, who, 'catalogue.write');
  const { archived, slug, ...d } = parse(collectionPatch, patch, 'collection');
  const { prefix, seasons } = await collectionSettings(deps, who);
  const now = deps.now?.() ?? new Date();
  const statusCode = await setting(deps, who, 'naming.redirectStatusCode');
  await deps.db.$transaction(async (tx) => {
    const cur = found(await tx.collection.findFirst({ where: { id, storeId: who.storeId } }), 'collection');
    const r = readRules(cur.rules);
    const kind = d.kind ?? cur.kind;
    const season = d.season !== undefined ? d.season : kind === 'SEASONAL' ? r.season : null;
    const rule = d.rule !== undefined ? d.rule : kind === 'RULE' ? r.rule : null;
    const startsAt = d.startsAt !== undefined ? d.startsAt : (cur.startsAt?.toISOString() ?? null);
    const endsAt = d.endsAt !== undefined ? d.endsAt : (cur.endsAt?.toISOString() ?? null);
    checkShape({ kind, season, rule, startsAt, endsAt }, seasons);
    await checkRuleRefs(tx, who.storeId, rule);
    if (slug && slug !== cur.slug) {
      await slugFree(tx, who.storeId, slug, cur.id);
      await moveLink(tx, who, collectionPath(prefix, cur.slug), collectionPath(prefix, slug), 'collection-slug', statusCode, now);
    }
    const next = {
      slug: slug ?? cur.slug,
      nameEn: d.nameEn ?? cur.nameEn,
      nameBn: d.nameBn !== undefined ? d.nameBn : cur.nameBn,
      kind,
      rules: (season || rule ? { season: season ?? null, rule: rule ?? null } : null) as Prisma.JsonValue,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null,
    };
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return;
    const { rules: _rules, ...rest } = next;
    await tx.collection.update({ where: { id: cur.id }, data: { ...rest, ...rulesData(season, rule) } });
    const action = archived === true && !cur.archivedAt ? 'collection.archive' : archived === false && cur.archivedAt ? 'collection.restore' : 'collection.update';
    await logChange(tx, who, action, 'Collection', cur.id, diff.before, diff.after);
  }, TX);
  return getCollection(deps, who, id);
}

export const collectionProductsInput = z
  .object({ productIds: z.array(z.uuid()).refine((l) => new Set(l).size === l.length, { message: 'each product once' }) })
  .strict();
export type CollectionProductsInput = z.input<typeof collectionProductsInput>;

/**
 * The products of a manual or seasonal collection, in the order given. One left out is taken out: its link is archived,
 * never deleted (hard rule 3), and putting the product back brings the same row back.
 */
export async function setCollectionProducts(deps: CatalogueDeps, who: Who, id: string, input: CollectionProductsInput): Promise<CollectionDetail> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(collectionProductsInput, input, 'collection products');
  const { maxProducts } = await collectionSettings(deps, who);
  const now = deps.now?.() ?? new Date();
  if (d.productIds.length > maxProducts) throw new CatalogueError('INVALID_INPUT', 'too many products in one collection', [`productIds: ${d.productIds.length} > ${maxProducts}`]);
  await deps.db.$transaction(async (tx) => {
    const c = found(await tx.collection.findFirst({ where: { id, storeId: who.storeId } }), 'collection');
    if (c.kind === 'RULE') throw new CatalogueError('INVALID_INPUT', "a rule collection's products follow its rule", ['kind']);
    if (c.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the collection is archived', ['collectionId']);
    const ps = await tx.product.findMany({ where: { storeId: who.storeId, id: { in: d.productIds } }, select: { id: true, archivedAt: true } });
    const missing = d.productIds.filter((p) => !ps.some((x) => x.id === p));
    if (missing.length) throw new CatalogueError('NOT_FOUND', 'no such product', missing.map((m) => `productId: ${m}`));
    const archivedP = ps.filter((p) => p.archivedAt).map((p) => p.id);
    if (archivedP.length) throw new CatalogueError('PARENT_ARCHIVED', 'the product is archived', archivedP.map((m) => `productId: ${m}`));
    const links = await tx.collectionProduct.findMany({ where: { collectionId: c.id } });
    const live = links.filter((l) => !l.archivedAt);
    const before = live.sort((a, b) => a.position - b.position).map((l) => l.productId);
    const removed = live.filter((l) => !d.productIds.includes(l.productId));
    for (const [i, productId] of d.productIds.entries()) {
      const cur = links.find((l) => l.productId === productId);
      if (!cur) await tx.collectionProduct.create({ data: { storeId: who.storeId, collectionId: c.id, productId, position: i } });
      else if (cur.archivedAt) await tx.collectionProduct.update({ where: { id: cur.id }, data: { position: i, archivedAt: null } });
      else if (cur.position !== i) await tx.collectionProduct.update({ where: { id: cur.id }, data: { position: i } });
    }
    for (const r of removed) await tx.collectionProduct.update({ where: { id: r.id }, data: { archivedAt: now } });
    if (JSON.stringify(before) !== JSON.stringify(d.productIds)) {
      await logChange(tx, who, 'collection.products', 'Collection', c.id, { productIds: before }, { productIds: d.productIds, removed: removed.map((r) => r.productId) });
    }
  }, TX);
  return getCollection(deps, who, id);
}

/**
 * Adds products at the end of manual or seasonal collections (the CSV import and bulk actions; never removes). A
 * product taken out earlier gets its archived link back.
 */
export async function addToCollection(tx: Tx, who: Who, collectionId: string, productIds: string[], maxProducts: number): Promise<number> {
  const links = await tx.collectionProduct.findMany({ where: { collectionId }, select: { id: true, productId: true, position: true, archivedAt: true } });
  const live = links.filter((l) => !l.archivedAt);
  const have = new Set(live.map((l) => l.productId));
  const add = [...new Set(productIds)].filter((p) => !have.has(p));
  if (!add.length) return 0;
  if (live.length + add.length > maxProducts) throw new CatalogueError('INVALID_INPUT', 'too many products in one collection', [`collection: ${live.length + add.length} > ${maxProducts}`]);
  let pos = live.reduce((m, l) => Math.max(m, l.position), -1);
  for (const productId of add) {
    const old = links.find((l) => l.productId === productId);
    if (old) await tx.collectionProduct.update({ where: { id: old.id }, data: { position: ++pos, archivedAt: null } });
    else await tx.collectionProduct.create({ data: { storeId: who.storeId, collectionId, productId, position: ++pos } });
  }
  await logChange(tx, who, 'collection.add', 'Collection', collectionId, null, { productIds: add });
  return add.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------------------------

export const tagInput = z.object({ slug: dictionaryKeySchema.optional(), name: text(40) }).strict();
export const tagPatch = z.object({ slug: dictionaryKeySchema.optional(), name: text(40).optional(), archived: z.boolean().optional() }).strict();
export type TagInput = z.input<typeof tagInput>;
export type TagPatch = z.input<typeof tagPatch>;

export interface TagView {
  id: string;
  slug: string;
  name: string;
  products: number;
  archived: boolean;
}

const tagInclude = { _count: { select: { products: { where: LIVE } } } } as const;
type TagRow = Prisma.TagGetPayload<{ include: typeof tagInclude }>;
const tagView = (t: TagRow): TagView => ({ id: t.id, slug: t.slug, name: t.name, products: t._count.products, archived: t.archivedAt != null });

/** Tags a product with each tag: its archived link back when it had one, else a new link (never a second row). */
async function linkTags(tx: Tx, who: Who, productId: string, tagIds: string[]): Promise<void> {
  if (!tagIds.length) return;
  const old = await tx.productTag.findMany({ where: { productId, tagId: { in: tagIds }, archivedAt: { not: null } }, select: { id: true, tagId: true } });
  for (const tagId of tagIds) {
    const o = old.find((x) => x.tagId === tagId);
    if (o) await tx.productTag.update({ where: { id: o.id }, data: { archivedAt: null } });
    else await tx.productTag.create({ data: { storeId: who.storeId, tagId, productId } });
  }
}

export async function listTags(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<TagView[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.tag.findMany({ where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, include: tagInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return rows.map(tagView);
}

export async function createTag(deps: CatalogueDeps, who: Who, input: TagInput): Promise<TagView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(tagInput, input, 'tag');
  const slug = d.slug ?? slugify(d.name, await slugOptions(deps, who));
  if (!slug) throw new CatalogueError('INVALID_INPUT', 'give the tag a key', ['slug']);
  return deps.db.$transaction(async (tx) => {
    if (await tx.tag.findUnique({ where: { storeId_slug: { storeId: who.storeId, slug } } })) throw new CatalogueError('CONFLICT', 'a tag with this key exists', ['slug']);
    const row = await tx.tag.create({ data: { storeId: who.storeId, slug, name: d.name }, include: tagInclude });
    await logChange(tx, who, 'tag.create', 'Tag', row.id, null, { slug, name: row.name });
    return tagView(row);
  }, TX);
}

export async function updateTag(deps: CatalogueDeps, who: Who, id: string, patch: TagPatch): Promise<TagView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(tagPatch, patch, 'tag');
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.tag.findFirst({ where: { id, storeId: who.storeId }, include: tagInclude }), 'tag');
    if (d.slug && d.slug !== cur.slug && (await tx.tag.findUnique({ where: { storeId_slug: { storeId: who.storeId, slug: d.slug } } }))) throw new CatalogueError('CONFLICT', 'a tag with this key exists', ['slug']);
    const next = { slug: d.slug ?? cur.slug, name: d.name ?? cur.name, archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null };
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return tagView(cur);
    const row = await tx.tag.update({ where: { id: cur.id }, data: next, include: tagInclude });
    await logChange(tx, who, archived === true && !cur.archivedAt ? 'tag.archive' : archived === false && cur.archivedAt ? 'tag.restore' : 'tag.update', 'Tag', row.id, diff.before, diff.after);
    return tagView(row);
  }, TX);
}

export const productTagsInput = z.object({ tagIds: z.array(z.uuid()).refine((l) => new Set(l).size === l.length, { message: 'each tag once' }) }).strict();
export type ProductTagsInput = z.input<typeof productTagsInput>;

async function liveTags(tx: Tx, storeId: number, ids: string[]) {
  const tags = await tx.tag.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, archivedAt: true } });
  const missing = ids.filter((i) => !tags.some((t) => t.id === i));
  if (missing.length) throw new CatalogueError('NOT_FOUND', 'no such tag', missing.map((m) => `tagId: ${m}`));
  const archived = tags.filter((t) => t.archivedAt).map((t) => t.id);
  if (archived.length) throw new CatalogueError('PARENT_ARCHIVED', 'the tag is archived', archived.map((m) => `tagId: ${m}`));
}

/** A product's tags, all at once. A tag left out comes off: its link is archived, never deleted (hard rule 3). */
export async function setProductTags(deps: CatalogueDeps, who: Who, productId: string, input: ProductTagsInput): Promise<TagView[]> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(productTagsInput, input, 'product tags');
  const max = await setting(deps, who, 'catalogue.tags.maxPerProduct');
  if (d.tagIds.length > max) throw new CatalogueError('INVALID_INPUT', 'too many tags on one product', [`tagIds: ${d.tagIds.length} > ${max}`]);
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const p = found(await tx.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
    const links = await tx.productTag.findMany({ where: { storeId: who.storeId, productId: p.id, ...LIVE } });
    const add = d.tagIds.filter((t) => !links.some((l) => l.tagId === t));
    await liveTags(tx, who.storeId, add);
    const removed = links.filter((l) => !d.tagIds.includes(l.tagId));
    await linkTags(tx, who, p.id, add);
    for (const r of removed) await tx.productTag.update({ where: { id: r.id }, data: { archivedAt: now } });
    if (add.length || removed.length) await logChange(tx, who, 'product.tags', 'Product', p.id, { tagIds: links.map((l) => l.tagId) }, { tagIds: d.tagIds, added: add, removed: removed.map((r) => r.tagId) });
  }, TX);
  return productTags(deps, who, productId);
}

export async function productTags(deps: CatalogueDeps, who: Who, productId: string): Promise<TagView[]> {
  await allow(deps, who, 'catalogue.read');
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
  const rows = await deps.db.tag.findMany({ where: { storeId: who.storeId, products: { some: { productId, ...LIVE } } }, include: tagInclude, orderBy: [{ name: 'asc' }] });
  return rows.map(tagView);
}

export const tagProductsInput = z.object({ action: z.enum(['add', 'remove']), productIds: z.array(z.uuid()).min(1).max(1000) }).strict();
export type TagProductsInput = z.input<typeof tagProductsInput>;

/** Puts one tag on many products, or takes it off them (bulk; taking off archives the links). */
export async function tagProducts(deps: CatalogueDeps, who: Who, tagId: string, input: TagProductsInput): Promise<{ changed: number }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(tagProductsInput, input, 'tag products');
  const max = await setting(deps, who, 'catalogue.tags.maxPerProduct');
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const tag = found(await tx.tag.findFirst({ where: { id: tagId, storeId: who.storeId } }), 'tag');
    const ids = [...new Set(d.productIds)];
    const ps = await tx.product.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: { id: true } });
    const missing = ids.filter((i) => !ps.some((p) => p.id === i));
    if (missing.length) throw new CatalogueError('NOT_FOUND', 'no such product', missing.map((m) => `productId: ${m}`));
    const links = await tx.productTag.findMany({ where: { tagId: tag.id, productId: { in: ids }, ...LIVE } });
    let n = 0;
    if (d.action === 'add') {
      if (tag.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the tag is archived', ['tagId']);
      n = await addTags(tx, who, ids.filter((i) => !links.some((l) => l.productId === i)).map((productId) => ({ productId, tagIds: [tag.id] })), max);
    } else {
      for (const l of links) await tx.productTag.update({ where: { id: l.id }, data: { archivedAt: now } });
      n = links.length;
      if (n) await logChange(tx, who, 'tag.products.remove', 'Tag', tag.id, { productIds: links.map((l) => l.productId) }, null);
    }
    return { changed: n };
  }, TX);
}

/** Adds tags to products, never removes (bulk and CSV). Refuses past `catalogue.tags.maxPerProduct`. */
export async function addTags(tx: Tx, who: Who, items: { productId: string; tagIds: string[] }[], maxPerProduct: number): Promise<number> {
  let n = 0;
  for (const it of items) {
    const have = await tx.productTag.findMany({ where: { storeId: who.storeId, productId: it.productId, ...LIVE }, select: { tagId: true } });
    const add = [...new Set(it.tagIds)].filter((t) => !have.some((h) => h.tagId === t));
    if (!add.length) continue;
    if (have.length + add.length > maxPerProduct) throw new CatalogueError('INVALID_INPUT', 'too many tags on one product', [`productId: ${it.productId}`]);
    await linkTags(tx, who, it.productId, add);
    await logChange(tx, who, 'product.tags.add', 'Product', it.productId, null, { added: add });
    n += add.length;
  }
  return n;
}
