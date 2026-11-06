// S02 · PR 597 follow-up (695, 6 Nov; demo WEB-02 "Save snapshot" / "Restore") — one page's own snapshots on Website ›
// Page layouts (one page: home, every category page, one category, the product pages, the bag) and Website › Side
// canvas, on PR 597's look model: a snapshot is a LayoutSnapshot (no migration) whose payload is `{ scope: 'page',
// place, data, auto? }`, so Website › Launch default (scope 'shop') and Marketing › Seasonal home (scope 'home') never
// list it.
// - Save: the page's arrangement as it is now (the sections in order with their switches and screens, the owner's own
//   sections of that page, one category's own-order switch; or the side canvas's switch, numbers and zones) under a
//   name. Refused STALE when the page changed since it was read.
// - Restore: first the page as it is now is saved by itself ("Before restoring …", so a restore is undone by restoring
//   that one), then the snapshot goes through the page's own Save (lib/website/layouts-admin saveLayout,
//   side-canvas-admin saveSide): every rule of that Save holds, and it is audited the same way. Sections and zones made
//   since are kept, switched off (look-model keepHidden; nothing is deleted); a saved one that no longer fits its rules
//   stays as it is now.
// - Never deleted. Seeing needs `website.read`; saving and restoring `website.layout.write`. Nothing here touches a
//   price, a discount, COD, a delivery charge, an order or a customer.
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { layoutBlockSchema, registry, sideZoneSchema, type LayoutBlock, type SideCanvas, type SideZone } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { fullLayout, isLayoutPage, type LayoutPage, type LayoutRow } from '../shop/layouts';
import { LayoutError, layoutView, saveLayout, type LayoutDeps, type LayoutView, type LayoutWho } from './layouts-admin';
import { keepHidden } from './look-model';
import { saveSide, sideView, type SideView } from './side-canvas-admin';

const S = MOTHER_STORE_ID;
/** The payload's marker for one page's snapshot (Launch default's looks are 'shop', Seasonal home's 'home'). */
export const PAGE_SNAP_SCOPE = 'page';
const SHOWN = 20; // hardcode-ok: a page-length guard
const NAME_MAX = 80; // hardcode-ok: a text-length guard
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a snapshot belongs: one Page layouts scope, or the side canvas. */
export type SnapPlace = { kind: 'layout'; page: LayoutPage; cat: string | null } | { kind: 'side' };

/** The place as stored and sent: `layout:home`, `layout:category`, `layout:category:<link name>`, `side`. */
export const placeKey = (p: SnapPlace): string => (p.kind === 'side' ? 'side' : `layout:${p.page}${p.cat ? `:${p.cat}` : ''}`);

/** A place from its key, or null when it is not one (a category only on the category pages). */
export function placeOf(key: unknown): SnapPlace | null {
  if (key === 'side') return { kind: 'side' };
  const m = typeof key === 'string' ? /^layout:([a-z]{1,20})(?::([a-z0-9-]{1,80}))?$/.exec(key) : null;
  if (!m || !isLayoutPage(m[1])) return null;
  const cat = m[2] ?? null;
  if (cat && m[1] !== 'category') return null;
  return { kind: 'layout', page: m[1], cat };
}

export interface LayoutData {
  sections: LayoutRow[];
  blocks: LayoutBlock[];
  /** One category: whether it keeps its own order (null for every other scope). */
  own: boolean | null;
}
export interface SideData {
  canvas: SideCanvas;
  zones: SideZone[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** What a page's Save gets back from a layout snapshot over the page as it is now. */
export function layoutRestoreInput(saved: unknown, now: LayoutView): { input: Record<string, unknown>; hidden: number } {
  const s = obj(saved);
  const byId = new Map(now.blocks.map((b) => [b.id, b]));
  // a saved section that no longer fits its rules (or is no longer this page's) stays as it is now
  const savedBlocks = list(s.blocks).flatMap((x) => {
    const ok = layoutBlockSchema.safeParse(x);
    if (ok.success && ok.data.page === now.page && ok.data.cat === (now.page === 'category' ? now.cat : null)) return [ok.data];
    const id = obj(x).id;
    const cur = typeof id === 'string' ? byId.get(id) : undefined;
    return cur ? [cur] : [];
  });
  const merged = keepHidden(savedBlocks, now.blocks);
  const rows = Array.isArray(s.sections) ? fullLayout(now.page, s.sections as LayoutRow[]) : now.rows;
  return {
    input: { page: now.page, cat: now.cat, sections: rows, blocks: merged.value, own: now.cat ? (typeof s.own === 'boolean' ? s.own : now.own) : undefined, version: now.version },
    hidden: merged.hidden,
  };
}

/** What the side canvas's Save gets back from a snapshot over the side canvas as it is now. */
export function sideRestoreInput(saved: unknown, now: SideView): { input: Record<string, unknown>; hidden: number } {
  const s = obj(saved);
  const canvas = registry['layout.sideCanvas'].schema.safeParse(s.canvas);
  const byId = new Map(now.zones.map((z) => [z.id, z]));
  const savedZones = list(s.zones).flatMap((x) => {
    const ok = sideZoneSchema.safeParse(x);
    if (ok.success) return [ok.data];
    const id = obj(x).id;
    const cur = typeof id === 'string' ? byId.get(id) : undefined;
    return cur ? [cur] : [];
  });
  const merged = keepHidden(savedZones, now.zones);
  return { input: { canvas: canvas.success ? canvas.data : now.canvas, zones: merged.value, version: now.version }, hidden: merged.hidden };
}

export interface PageSnapRow {
  id: string;
  name: string;
  /** Saved by itself just before a restore: the name of the snapshot that was restored. */
  before: string | null;
  at: string;
  by: string | null;
}

export interface PageSnapView {
  place: string;
  version: string;
  snaps: PageSnapRow[];
}

const where = (key: string) => ({ storeId: S, archivedAt: null, AND: [{ payload: { path: ['scope'], equals: PAGE_SNAP_SCOPE } }, { payload: { path: ['place'], equals: key } }] });

async function current(deps: LayoutDeps, p: SnapPlace): Promise<{ version: string; data: LayoutData | SideData; layout?: LayoutView; side?: SideView }> {
  if (p.kind === 'side') {
    const side = await sideView(deps);
    return { version: side.version, data: { canvas: side.canvas, zones: side.zones }, side };
  }
  const layout = await layoutView(deps, p.page, p.cat);
  return { version: layout.version, data: { sections: layout.rows, blocks: layout.blocks, own: layout.own }, layout };
}

/** The place's snapshots, newest first, with the page's version (what Save and Restore must name). */
export async function pageSnaps(deps: LayoutDeps, p: SnapPlace): Promise<PageSnapView> {
  const key = placeKey(p);
  const [now, rows] = await Promise.all([current(deps, p), deps.db.layoutSnapshot.findMany({ where: where(key), orderBy: { createdAt: 'desc' }, take: SHOWN })]);
  const people = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const staff = people.length ? await deps.db.staffUser.findMany({ where: { id: { in: people } }, select: { id: true, displayName: true } }) : [];
  return {
    place: key,
    version: now.version,
    snaps: rows.map((r) => {
      const auto = obj(obj(r.payload).auto);
      return { id: r.id, name: r.name, before: typeof auto.of === 'string' ? auto.of : null, at: r.createdAt.toISOString(), by: staff.find((s) => s.id === r.createdById)?.displayName ?? null };
    }),
  };
}

async function knownPlace(deps: LayoutDeps, p: SnapPlace | null): Promise<SnapPlace> {
  if (!p) throw new LayoutError('INVALID_INPUT', 400, ['place']);
  if (p.kind === 'layout' && p.cat && !(await deps.db.category.count({ where: { storeId: S, slug: p.cat, archivedAt: null } }))) throw new LayoutError('INVALID_INPUT', 400, ['place']);
  return p;
}

/** Save the page as it is now under a name; answers the new snapshot's id. */
export async function savePageSnap(deps: LayoutDeps, who: LayoutWho, p: SnapPlace, o: { name?: unknown; version?: unknown }): Promise<string> {
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, NAME_MAX) : '';
  if (!name) throw new LayoutError('INVALID_INPUT', 400, ['name']);
  const now = await current(deps, p);
  if (o.version !== now.version) throw new LayoutError('STALE', 409);
  const place = placeKey(p);
  const row = await deps.db.layoutSnapshot.create({ data: { storeId: S, name, payload: { scope: PAGE_SNAP_SCOPE, place, data: now.data } as unknown as Prisma.InputJsonValue, createdById: who.actor.staffUserId ?? null } });
  await audit(deps.db, who.actor, { storeId: S, action: 'website.snapshot.save', entityType: 'LayoutSnapshot', entityId: row.id, after: { place, name } }, who.ctx);
  return row.id;
}

export interface PageRestoreDone {
  beforeId: string;
  hidden: number;
}

/** Restore one snapshot of the place: the page as it is now is saved first, then the page's own Save writes it. */
export async function restorePageSnap(deps: LayoutDeps, who: LayoutWho, p: SnapPlace, o: { id?: unknown; version?: unknown }): Promise<PageRestoreDone> {
  if (typeof o.id !== 'string' || !UUID_RE.test(o.id)) throw new LayoutError('INVALID_INPUT', 400, ['id']);
  const place = placeKey(p);
  const snap = await deps.db.layoutSnapshot.findFirst({ where: { ...where(place), id: o.id } });
  if (!snap) throw new LayoutError('not-found', 404);
  const now = await current(deps, p);
  if (o.version !== now.version) throw new LayoutError('STALE', 409);
  const data = obj(snap.payload).data;
  const plan = now.layout ? layoutRestoreInput(data, now.layout) : sideRestoreInput(data, now.side!);
  const before = await deps.db.layoutSnapshot.create({
    data: { storeId: S, name: snap.name, payload: { scope: PAGE_SNAP_SCOPE, place, data: now.data, auto: { kind: 'restore', of: snap.name } } as unknown as Prisma.InputJsonValue, createdById: who.actor.staffUserId ?? null },
  });
  try {
    if (p.kind === 'side') await saveSide(deps, who, plan.input);
    else await saveLayout(deps, who, plan.input);
  } catch (e) {
    // the page's Save refused it: nothing changed, so the "before" copy is set aside (never deleted, never listed)
    await deps.db.layoutSnapshot.update({ where: { id: before.id }, data: { archivedAt: new Date() } }).catch(() => undefined);
    throw e;
  }
  await audit(deps.db, who.actor, { storeId: S, action: 'website.snapshot.restore', entityType: 'LayoutSnapshot', entityId: snap.id, before: { look: before.id }, after: { place, name: snap.name, hidden: plan.hidden } }, who.ctx);
  return { beforeId: before.id, hidden: plan.hidden };
}

/** /api/admin/website/snapshots — GET ?place= (`website.read`); POST {action: save | restore, place, …} (`website.layout.write`). */
export async function pageSnapsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LayoutDeps = { db: deps!.db, resolver: deps!.resolver };
  const who: LayoutWho = { actor: g.actor, ctx: g.ctx };
  try {
    const p = await knownPlace(d, placeOf(method === 'GET' ? new URL(request.url).searchParams.get('place') : b.place));
    if (method === 'GET') return json({ ok: true, ...(await pageSnaps(d, p)) });
    if (b.action === 'save') {
      const id = await savePageSnap(d, who, p, b);
      return json({ ok: true, id, ...(await pageSnaps(d, p)) });
    }
    if (b.action === 'restore') {
      const done = await restorePageSnap(d, who, p, b);
      return json({ ok: true, done, ...(await pageSnaps(d, p)) });
    }
    throw new LayoutError('INVALID_INPUT', 400, ['action']);
  } catch (e) {
    return e instanceof LayoutError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
