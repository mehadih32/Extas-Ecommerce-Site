// S02 · PR 76 (Blueprint D1.3, D4.2; BACKEND-ARCHITECTURE WEB-02) — Website › Page layouts, the server side: one page's
// sections as the owner arranged them (order, show, screens) with the version they were read at, and saving a new
// arrangement. The list is the page's own setting (`home.sections`, `layout.category`; lib/shop/layouts.ts); a save is
// checked against that setting's schema, refused when someone saved in between (STALE), and audited
// (`website.layout.save`, before and after). Seeing needs `website.read`, saving `website.layout.write`. Nothing here
// touches a price, an order or a customer.
// PR 595 (page layout builder): the home page and the category pages also carry the owner's own sections
// (`layout.blocks`, registry-layout-blocks.ts) for the page's scope (home; every category page; one category), and one
// category may keep its own order (`layout.categoryOwn`, with its switch). A save names every own section of the scope
// (a section is hidden, never deleted), each new one with a fresh id; the page and category of each come from the
// scope, never from the editor. The version covers all three settings of the scope.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { LAYOUT_DEVICES, layoutBlockSchema, registry, storeTarget, type CategoryOwn, type LayoutBlock, type LayoutDevice } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { productPath } from '../shop/home-model';
import { defaultLayout, fullLayout, isLayoutPage, PAGE_LAYOUTS, type LayoutPage, type LayoutRow, type PageLayoutDef } from '../shop/layouts';
import { ROUTES } from '../shop/routes';

const S = MOTHER_STORE_ID;

export class LayoutError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface LayoutDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
}

export interface LayoutWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface LayoutView {
  page: LayoutPage;
  /** PR 595 · category pages: one category's link name, or null = every category page. */
  cat: string | null;
  rows: LayoutRow[];
  defaults: LayoutRow[];
  locked: string[];
  version: string;
  /** PR 595 · the owner's own sections of this scope (home, every category page, or this category), in their order. */
  blocks: LayoutBlock[];
  /** PR 595 · one category: whether it keeps its own order (null for every other scope). */
  own: boolean | null;
  /** PR 595 · one category: how many sections for every category page also show here. */
  shared: number;
  /** PR 595 · one category: its own order kept while switched off (null = it never had one). */
  ownRows: LayoutRow[] | null;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

async function savedOf(deps: LayoutDeps, page: LayoutPage): Promise<LayoutRow[]> {
  return (await deps.resolver.value(PAGE_LAYOUTS[page].key, { storeId: S })) as LayoutRow[];
}

const allBlocks = async (deps: LayoutDeps) => (await deps.resolver.value('layout.blocks', { storeId: S })) as LayoutBlock[];
const allOwn = async (deps: LayoutDeps) => (await deps.resolver.value('layout.categoryOwn', { storeId: S })) as CategoryOwn;
/** Whether a block belongs to the scope: the home page, every category page (cat null), or one category. */
const inScope = (page: LayoutPage, cat: string | null) => (b: LayoutBlock) => (page === 'home' ? b.page === 'home' : page === 'category' && b.page === 'category' && b.cat === cat);
const takesBlocks = (page: LayoutPage) => page === 'home' || page === 'category';

/** A category the owner may give its own layout: one of the store's, not archived. */
async function knownCategory(deps: LayoutDeps, cat: string): Promise<boolean> {
  return (await deps.db.category.count({ where: { storeId: S, slug: cat, archivedAt: null } })) > 0;
}

/**
 * One page's arrangement: every section in order (the ones the save does not name at the end, hidden). PR 595: with the
 * owner's sections of the scope, and for one category its own order (while it has none, the order of every category).
 */
export async function layoutView(deps: LayoutDeps, page: LayoutPage, cat: string | null = null): Promise<LayoutView> {
  const [saved, blocks, own] = await Promise.all([savedOf(deps, page), takesBlocks(page) ? allBlocks(deps) : Promise.resolve([]), cat ? allOwn(deps) : Promise.resolve([])]);
  const mine = cat ? own.find((x) => x.cat === cat) : undefined;
  const scope = blocks.filter(inScope(page, cat));
  const rowsSaved = mine?.on ? mine.rows : saved;
  return {
    page,
    cat,
    rows: fullLayout(page, rowsSaved),
    defaults: cat ? fullLayout(page, saved) : defaultLayout(page),
    locked: [...PAGE_LAYOUTS[page].locked],
    version: versionOf([saved, scope, mine ?? null]),
    blocks: scope,
    own: cat ? (mine?.on ?? false) : null,
    shared: cat ? blocks.filter(inScope('category', null)).length : 0,
    ownRows: mine ? fullLayout(page, mine.rows) : null,
  };
}

/** The editor's sections of the scope, checked one by one; the page and category always come from the scope. */
function blocksIn(raw: unknown, page: LayoutPage, cat: string | null): LayoutBlock[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: LayoutBlock[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') return null;
    const ok = layoutBlockSchema.safeParse({ ...(x as Record<string, unknown>), page, cat: page === 'category' ? cat : null });
    if (!ok.success) return null;
    out.push(ok.data);
  }
  return out;
}

/** A row from the editor, or null when it is not one. */
function rowOf(v: unknown): LayoutRow | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!o || typeof o.id !== 'string' || typeof o.on !== 'boolean') return null;
  const dev = o.dev === undefined ? 'both' : o.dev;
  if (!LAYOUT_DEVICES.includes(dev as LayoutDevice)) return null;
  return { id: o.id, on: o.on, ...(dev !== 'both' ? { dev: dev as LayoutDevice } : {}) };
}

/**
 * PUT {page, cat?, sections: [{id, on, dev}], blocks?, own?, version}: the page's new arrangement. Audited; nothing
 * written when unchanged. PR 595: `blocks` = every own section of the scope (none dropped), `own` = one category's switch.
 */
export async function saveLayout(deps: LayoutDeps, who: LayoutWho, input: unknown): Promise<LayoutView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (!isLayoutPage(o.page)) throw new LayoutError('INVALID_INPUT', 400, ['page']);
  const page = o.page;
  const cat = o.cat === undefined || o.cat === null || o.cat === '' ? null : o.cat;
  if (cat !== null && (page !== 'category' || typeof cat !== 'string' || !(await knownCategory(deps, cat)))) throw new LayoutError('INVALID_INPUT', 400, ['cat']);
  const def: PageLayoutDef = PAGE_LAYOUTS[page];
  const list = Array.isArray(o.sections) ? o.sections.map(rowOf) : null;
  if (!list || list.some((r) => r === null)) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  const rows = list as LayoutRow[];
  // every section of the page exactly once: a save never drops or invents one
  const ids = rows.map((r) => r.id);
  if (ids.length !== def.ids.length || new Set(ids).size !== ids.length || !def.ids.every((id) => ids.includes(id))) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  if (rows.some((r) => !r.on && def.locked.includes(r.id))) throw new LayoutError('LOCKED', 400, ['sections']);
  const mineBlocks = takesBlocks(page) ? blocksIn(o.blocks, page, cat) : o.blocks === undefined || (Array.isArray(o.blocks) && !o.blocks.length) ? [] : null;
  if (!mineBlocks) throw new LayoutError('INVALID_INPUT', 400, ['blocks']);
  const [before, blocksBefore, ownBefore] = await Promise.all([savedOf(deps, page), takesBlocks(page) ? allBlocks(deps) : Promise.resolve([]), cat ? allOwn(deps) : Promise.resolve([])]);
  const scopeBefore = blocksBefore.filter(inScope(page, cat));
  const mineBefore = cat ? ownBefore.find((x) => x.cat === cat) : undefined;
  if (o.version !== versionOf([before, scopeBefore, mineBefore ?? null])) throw new LayoutError('STALE', 409);
  // a section is hidden, never deleted: every one the scope had is still named; a new one takes an id nobody uses
  const named = new Set(mineBlocks.map((b) => b.id));
  if (named.size !== mineBlocks.length || scopeBefore.some((b) => !named.has(b.id))) throw new LayoutError('INVALID_INPUT', 400, ['blocks']);
  const others = blocksBefore.filter((b) => !inScope(page, cat)(b));
  if (others.some((b) => named.has(b.id))) throw new LayoutError('INVALID_INPUT', 400, ['blocks']);
  const ok = registry[def.key].schema.safeParse(rows);
  if (!ok.success) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  const nextBlocks = registry['layout.blocks'].schema.safeParse([...others, ...mineBlocks]);
  if (!nextBlocks.success) throw new LayoutError('INVALID_INPUT', 400, ['blocks']);
  const how = { actorId: who.actor.staffUserId ?? null, reason: 'Website › Page layouts' };
  const changed: string[] = [];
  if (cat === null && versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set(def.key, ok.data as never, storeTarget(S), how);
    changed.push(def.key);
  }
  if (cat !== null) {
    // one category: its own order with its switch (off keeps the order); while it never had one and stays off, nothing
    const on = o.own === true;
    const entry = on || mineBefore ? { cat, on, rows: on ? ok.data : mineBefore!.rows } : null;
    if (entry && versionOf(entry) !== versionOf(mineBefore ?? null)) {
      const next = registry['layout.categoryOwn'].schema.safeParse([...ownBefore.filter((x) => x.cat !== cat), entry]);
      if (!next.success) throw new LayoutError('INVALID_INPUT', 400, ['own']);
      await deps.resolver.set('layout.categoryOwn', next.data, storeTarget(S), how);
      changed.push('layout.categoryOwn');
    }
  }
  if (takesBlocks(page) && versionOf(mineBlocks) !== versionOf(scopeBefore)) {
    await deps.resolver.set('layout.blocks', nextBlocks.data, storeTarget(S), how);
    changed.push('layout.blocks');
  }
  if (changed.length) {
    await audit(
      deps.db,
      who.actor,
      { storeId: S, action: 'website.layout.save', entityType: 'Setting', entityId: changed.join(','), before: { page, cat, sections: cat ? (mineBefore ?? null) : before, blocks: scopeBefore }, after: { page, cat, sections: ok.data, own: cat ? o.own === true : undefined, blocks: mineBlocks } },
      who.ctx,
    );
  }
  return layoutView(deps, page, cat);
}

const answer = (e: unknown): Response => (e instanceof LayoutError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/website/layouts — GET ?page= (`website.read`); PUT a page's arrangement (`website.layout.write`). */
export async function layoutsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LayoutDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    if (method === 'GET') {
      const q = new URL(request.url).searchParams;
      const page = q.get('page') ?? 'home';
      if (!isLayoutPage(page)) throw new LayoutError('INVALID_INPUT', 400, ['page']);
      const cat = q.get('cat') || null;
      if (cat !== null && (page !== 'category' || !(await knownCategory(d, cat)))) throw new LayoutError('INVALID_INPUT', 400, ['cat']);
      return json({ ok: true, ...(await layoutView(d, page, cat)) });
    }
    return json({ ok: true, ...(await saveLayout(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return answer(e);
  }
}

/** PR 595 · what the section form offers: the store's categories, live products, tags and set rules (names only). */
export interface LayoutChoices {
  cats: { slug: string; en: string; bn: string | null }[];
  products: { slug: string; en: string; bn: string | null }[];
  tags: { slug: string; name: string }[];
  rules: { id: string; en: string; bn: string | null }[];
}

export async function layoutChoices(db: PrismaClient): Promise<LayoutChoices> {
  const [cats, products, tags, rules] = await Promise.all([
    db.category.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { slug: true, nameEn: true, nameBn: true } }),
    db.product.findMany({ where: { storeId: S, archivedAt: null, status: 'PUBLISHED' }, orderBy: [{ nameEn: 'asc' }], select: { slug: true, nameEn: true, nameBn: true } }),
    db.tag.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { name: 'asc' }, select: { slug: true, name: true } }),
    db.comboAutoRule.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, nameBn: true } }),
  ]);
  return {
    cats: cats.map((c) => ({ slug: c.slug, en: c.nameEn, bn: c.nameBn })),
    products: products.map((p) => ({ slug: p.slug, en: p.nameEn, bn: p.nameBn })),
    tags,
    rules: rules.map((r) => ({ id: r.id, en: r.name, bn: r.nameBn })),
  };
}

/**
 * PR 77 follow-up (667) — the shop page "Open the page" and the preview show: the home page, the bag, one category's
 * own page, the picked product (else the first by name) for the product pages, and "New in" for every category page
 * (and for the product pages while the shop has no product). An unknown link name is never used.
 */
export function layoutOpenPath(o: { page: LayoutPage; cat: string | null; products: readonly { slug: string }[]; askedProd: string | null; productPrefix: string }): { path: string; prod: string | null } {
  if (o.page === 'home') return { path: ROUTES.home, prod: null };
  if (o.page === 'bag') return { path: ROUTES.bag, prod: null };
  if (o.page === 'category') return { path: o.cat ? ROUTES.category(o.cat) : ROUTES.newIn, prod: null };
  const prod = o.products.find((p) => p.slug === o.askedProd)?.slug ?? o.products[0]?.slug ?? null;
  return { path: prod ? productPath(o.productPrefix, prod) : ROUTES.newIn, prod };
}
