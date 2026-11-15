// PR 746 + 747 — Products › Categories & tags at /admin/products/structure: the owner arranges the shop's own lists
// without code. Three cards, each saved whole with its own version (a card changed by someone else in between answers
// STALE and is read again):
//   • Categories — the live categories of each level in the owner's order, each shown or hidden in the shop (a hidden one
//     is not deleted; the shop's menu and tiles skip it). Order is the category's own `sortOrder`.
//   • Collections — the order of the collection list (`catalogue.collections.order`; collections not placed follow by name).
//   • Tag badges — which tag shows as the badge on a product card, first match wins, a tag that never shows, and the words
//     shown instead of the tag's own name in English and Bengali (`card.tagBadges`).
// Seeing needs `catalogue.read`; saving `catalogue.write` (checked here again). The audit row names the card and the
// order before and after, never a long text. Nothing is deleted.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import * as cat from '@extas/catalogue';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeTarget, tagBadgesSchema, collectionOrderSchema } from '@extas/settings';
import type { AppResolver } from '../settings';

export interface StructureDeps {
  db: PrismaClient;
  resolver: AppResolver;
}
export interface StructureWho {
  actor: Actor;
  ctx: RequestContext;
}
export interface Pair {
  en: string;
  bn: string;
}

export interface CategoryRow {
  id: string;
  parentId: string | null;
  name: Pair;
  on: boolean;
  products: number;
}
export interface CollectionRow {
  id: string;
  name: Pair;
  kind: string;
}
export interface TagRow {
  id: string;
  name: string;
  on: boolean;
  label: Pair | null;
}
export interface StructureCards {
  categories: { key: 'categories'; value: { rows: CategoryRow[] }; version: string };
  collections: { key: 'collections'; value: { rows: CollectionRow[] }; version: string };
  tags: { key: 'tags'; value: { rows: TagRow[] }; version: string };
}

export class StructureError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isStructureError = (e: unknown): e is StructureError => e instanceof StructureError;

const S = MOTHER_STORE_ID;
const at = { storeId: S };
export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = (...d: string[]) => new StructureError('INVALID_INPUT', 400, d);

const deps = (d: StructureDeps) => ({ db: d.db, settings: d.resolver });
const whoOf = (w: StructureWho) => ({ actor: w.actor, storeId: S, ctx: w.ctx });

/** Every live category, level by level (the top first, then each parent's children), each level in its saved order. */
async function categoriesRead(d: StructureDeps, who: StructureWho): Promise<CategoryRow[]> {
  const tree = await cat.categoryTree(deps(d), whoOf(who));
  const out: CategoryRow[] = [];
  const walk = (nodes: cat.CategoryNode[], parentId: string | null) => {
    for (const n of nodes) out.push({ id: n.id, parentId, name: { en: n.nameEn, bn: n.nameBn ?? '' }, on: n.isVisible, products: n.products });
    for (const n of nodes) walk(n.children, n.id);
  };
  walk(tree, null);
  return out;
}

async function collectionsRead(d: StructureDeps, who: StructureWho): Promise<CollectionRow[]> {
  const list = await cat.listCollections(deps(d), whoOf(who));
  return list.map((c) => ({ id: c.slug, name: { en: c.nameEn, bn: c.nameBn ?? '' }, kind: c.kind }));
}

async function tagsRead(d: StructureDeps): Promise<TagRow[]> {
  const [cfg, tags] = await Promise.all([d.resolver.value('card.tagBadges', at), d.db.tag.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { slug: true, name: true } })]);
  const rank = (slug: string) => {
    const i = cfg.order.indexOf(slug);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...tags]
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .map((t) => ({ id: t.slug, name: t.name, on: !cfg.hidden.includes(t.slug), label: cfg.labels[t.slug] ?? null }));
}

const card = <K extends keyof StructureCards>(key: K, rows: unknown) => ({ key, value: { rows }, version: versionOf(rows) }) as StructureCards[K];

export async function structureView(d: StructureDeps, who: StructureWho): Promise<StructureCards> {
  const [categories, collections, tags] = await Promise.all([categoriesRead(d, who), collectionsRead(d, who), tagsRead(d)]);
  return { categories: card('categories', categories), collections: card('collections', collections), tags: card('tags', tags) };
}

const txt = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const rowsOf = (v: unknown): Record<string, unknown>[] => {
  if (!isObj(v) || !Array.isArray(v.rows)) throw invalid('rows');
  if (!v.rows.every(isObj)) throw invalid('rows');
  return v.rows as Record<string, unknown>[];
};

async function saveCategories(d: StructureDeps, who: StructureWho, input: unknown): Promise<string[]> {
  const rows = rowsOf(input);
  const now = await categoriesRead(d, who);
  const byId = new Map(now.map((r) => [r.id, r]));
  const sent = rows.map((r) => ({ id: txt(r.id, 60), on: r.on === true }));
  if (new Set(sent.map((r) => r.id)).size !== sent.length || sent.some((r) => !byId.has(r.id)) || sent.length !== now.length) throw invalid('rows');
  const changed: string[] = [];
  // each level's order: the ids of that parent, in the order the screen sent them
  const parents = new Set(now.map((r) => r.parentId));
  for (const parentId of parents) {
    const ids = sent.filter((r) => byId.get(r.id)!.parentId === parentId).map((r) => r.id);
    const was = now.filter((r) => r.parentId === parentId).map((r) => r.id);
    if (ids.join() === was.join()) continue;
    const a = await cat.reorderCategories(deps(d), whoOf(who), { parentId, ids });
    if (a.changed) changed.push(`order:${parentId ?? 'top'}`);
  }
  for (const r of sent) {
    if (byId.get(r.id)!.on === r.on) continue;
    await cat.updateCategory(deps(d), whoOf(who), r.id, { isVisible: r.on });
    changed.push(`${r.on ? 'show' : 'hide'}:${r.id}`);
  }
  return changed;
}

async function saveCollections(d: StructureDeps, who: StructureWho, input: unknown): Promise<string[]> {
  const ids = rowsOf(input).map((r) => txt(r.id, 60));
  const parsed = collectionOrderSchema.safeParse(ids);
  const known = new Set((await collectionsRead(d, who)).map((r) => r.id));
  if (!parsed.success || ids.some((i) => !known.has(i))) throw invalid('rows');
  const cur = await d.resolver.value('catalogue.collections.order', at);
  if (JSON.stringify(cur) === JSON.stringify(parsed.data)) return [];
  await d.resolver.set('catalogue.collections.order', parsed.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Products › Categories & tags: the order of the collections' });
  return ['order'];
}

async function saveTags(d: StructureDeps, who: StructureWho, input: unknown): Promise<string[]> {
  const rows = rowsOf(input);
  const known = new Set((await tagsRead(d)).map((r) => r.id));
  const sent = rows.map((r) => {
    const l = isObj(r.label) ? { en: txt(r.label.en, 24), bn: txt(r.label.bn, 24) } : null;
    return { id: txt(r.id, 60), on: r.on === true, label: l && (l.en || l.bn) ? l : null };
  });
  // a badge word is in both languages or in neither: a half-written pair is refused, never guessed
  if (sent.some((r) => !known.has(r.id) || (r.label && (!r.label.en || !r.label.bn)))) throw invalid('rows');
  const value = { order: sent.map((r) => r.id), hidden: sent.filter((r) => !r.on).map((r) => r.id), labels: Object.fromEntries(sent.filter((r) => r.label).map((r) => [r.id, r.label])) };
  const parsed = tagBadgesSchema.safeParse(value);
  if (!parsed.success) throw invalid('rows');
  const cur = await d.resolver.value('card.tagBadges', at);
  if (JSON.stringify(cur) === JSON.stringify(parsed.data)) return [];
  await d.resolver.set('card.tagBadges', parsed.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Products › Categories & tags: the badge on a product card' });
  return ['badges'];
}

export async function saveStructureCard(d: StructureDeps, who: StructureWho, input: unknown): Promise<StructureCards> {
  await requirePermission(d.db, who.actor, 'catalogue.write', { storeId: S });
  if (!isObj(input) || !isObj(input.value)) throw invalid('key', 'value');
  const key = input.key;
  if (key !== 'categories' && key !== 'collections' && key !== 'tags') throw invalid('key');
  const before = await structureView(d, who);
  const was = before[key].version;
  if (input.version !== undefined && input.version !== was) throw new StructureError('STALE', 409, ['version'], { version: was });
  const changed = key === 'categories' ? await saveCategories(d, who, input.value) : key === 'collections' ? await saveCollections(d, who, input.value) : await saveTags(d, who, input.value);
  if (changed.length) await audit(d.db, who.actor, { storeId: S, action: `structure.${key}.save`, entityType: 'Setting', entityId: key, before: { order: before[key].value.rows.map((r) => r.id) }, after: { changed } }, who.ctx);
  return structureView(d, who);
}
