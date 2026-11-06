// S02 · PR 76 (Blueprint D1.3, D4.2; BACKEND-ARCHITECTURE WEB-02) — Website › Page layouts, the server side: one page's
// sections as the owner arranged them (order, show, screens) with the version they were read at, and saving a new
// arrangement. The list is the page's own setting (`home.sections`, `layout.category`; lib/shop/layouts.ts); a save is
// checked against that setting's schema, refused when someone saved in between (STALE), and audited
// (`website.layout.save`, before and after). Seeing needs `website.read`, saving `website.layout.write`. Nothing here
// touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { LAYOUT_DEVICES, registry, storeTarget, type LayoutDevice } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { defaultLayout, fullLayout, isLayoutPage, PAGE_LAYOUTS, type LayoutPage, type LayoutRow, type PageLayoutDef } from '../shop/layouts';

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
  rows: LayoutRow[];
  defaults: LayoutRow[];
  locked: string[];
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

async function savedOf(deps: LayoutDeps, page: LayoutPage): Promise<LayoutRow[]> {
  return (await deps.resolver.value(PAGE_LAYOUTS[page].key, { storeId: S })) as LayoutRow[];
}

/** One page's arrangement: every section in order (the ones the save does not name at the end, hidden). */
export async function layoutView(deps: LayoutDeps, page: LayoutPage): Promise<LayoutView> {
  const saved = await savedOf(deps, page);
  return { page, rows: fullLayout(page, saved), defaults: defaultLayout(page), locked: [...PAGE_LAYOUTS[page].locked], version: versionOf(saved) };
}

/** A row from the editor, or null when it is not one. */
function rowOf(v: unknown): LayoutRow | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!o || typeof o.id !== 'string' || typeof o.on !== 'boolean') return null;
  const dev = o.dev === undefined ? 'both' : o.dev;
  if (!LAYOUT_DEVICES.includes(dev as LayoutDevice)) return null;
  return { id: o.id, on: o.on, ...(dev !== 'both' ? { dev: dev as LayoutDevice } : {}) };
}

/** PUT {page, sections: [{id, on, dev}], version}: the page's new arrangement. Audited; nothing written when unchanged. */
export async function saveLayout(deps: LayoutDeps, who: LayoutWho, input: unknown): Promise<LayoutView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (!isLayoutPage(o.page)) throw new LayoutError('INVALID_INPUT', 400, ['page']);
  const page = o.page;
  const def: PageLayoutDef = PAGE_LAYOUTS[page];
  const list = Array.isArray(o.sections) ? o.sections.map(rowOf) : null;
  if (!list || list.some((r) => r === null)) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  const rows = list as LayoutRow[];
  // every section of the page exactly once: a save never drops or invents one
  const ids = rows.map((r) => r.id);
  if (ids.length !== def.ids.length || new Set(ids).size !== ids.length || !def.ids.every((id) => ids.includes(id))) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  if (rows.some((r) => !r.on && def.locked.includes(r.id))) throw new LayoutError('LOCKED', 400, ['sections']);
  const before = await savedOf(deps, page);
  if (o.version !== versionOf(before)) throw new LayoutError('STALE', 409);
  const ok = registry[def.key].schema.safeParse(rows);
  if (!ok.success) throw new LayoutError('INVALID_INPUT', 400, ['sections']);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set(def.key, ok.data as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Page layouts' });
    await audit(deps.db, who.actor, { storeId: S, action: 'website.layout.save', entityType: 'Setting', entityId: def.key, before: { page, sections: before }, after: { page, sections: ok.data } }, who.ctx);
  }
  return layoutView(deps, page);
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
      const page = new URL(request.url).searchParams.get('page') ?? 'home';
      if (!isLayoutPage(page)) throw new LayoutError('INVALID_INPUT', 400, ['page']);
      return json({ ok: true, ...(await layoutView(d, page)) });
    }
    return json({ ok: true, ...(await saveLayout(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return answer(e);
  }
}
