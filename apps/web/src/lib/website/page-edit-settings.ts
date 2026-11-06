// S02 · PR 600 — Website › More › On-page edit, the server side: the switch `shop.pageEdit` (off as shipped) with its
// options (phone light version, "Apply to phone too?", which phone checks run, tap sizes, the phone screens checked) and
// the on-page publishes (each one is a restore of Website › Launch default, so it is undone there or from the bar).
// Seeing needs `website.read`; saving `website.layout.write` (STALE when saved in between; audited
// website.pageEdit.settings). Only the owner (super admin) ever sees the bar on the shop (lib/website/page-edit-shop.ts).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { pageEditSchema, storeTarget, type PageEdit } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { LookDeps } from './launch-default-admin';
import { isShopLook, lookOf } from './look-model';
import { PageEditError } from './page-edit-admin';
import { versionOf } from './page-edit-model';

const S = MOTHER_STORE_ID;
// hardcode-ok: a page-length guard
const LOG_SHOWN = 20;

export interface PublishRow {
  id: string;
  at: string;
  by: string | null;
  undone: boolean;
}

export interface PageEditSettingsView {
  cfg: PageEdit;
  version: string;
  log: PublishRow[];
  /** Open drafts (owners who changed something and have not published). */
  drafts: number;
}

export async function pageEditSettingsView(deps: LookDeps): Promise<PageEditSettingsView> {
  const [cfg, restores, drafts] = await Promise.all([
    deps.resolver.value('shop.pageEdit', { storeId: S }),
    deps.db.layoutRestore.findMany({ where: { storeId: S, undoOfId: null }, orderBy: { createdAt: 'desc' }, take: LOG_SHOWN * 3, include: { snapshot: { select: { payload: true } } } }),
    deps.db.layoutSnapshot.count({ where: { storeId: S, archivedAt: null, payload: { path: ['scope'], equals: 'edit-draft' } } }),
  ]);
  const mine = restores.filter((r) => isShopLook(r.snapshot.payload) && lookOf(r.snapshot.payload).auto?.kind === 'edit').slice(0, LOG_SHOWN);
  const ids = mine.map((r) => r.id);
  const [undos, staff] = await Promise.all([
    ids.length ? deps.db.layoutRestore.findMany({ where: { undoOfId: { in: ids } }, select: { undoOfId: true } }) : [],
    deps.db.staffUser.findMany({ where: { id: { in: [...new Set(mine.map((r) => r.actorId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } }),
  ]);
  const undone = new Set(undos.map((u) => u.undoOfId));
  return {
    cfg: cfg as PageEdit,
    version: versionOf(cfg),
    log: mine.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), by: staff.find((s) => s.id === r.actorId)?.displayName ?? null, undone: undone.has(r.id) })),
    drafts,
  };
}

export async function savePageEditSettings(deps: LookDeps, who: { actor: Actor; ctx: RequestContext }, input: unknown): Promise<PageEditSettingsView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const ok = pageEditSchema.safeParse(o.cfg);
  if (!ok.success) throw new PageEditError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'cfg')))]);
  const before = (await deps.resolver.value('shop.pageEdit', { storeId: S })) as PageEdit;
  if (o.version !== versionOf(before)) throw new PageEditError('STALE', 409);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('shop.pageEdit', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Website › On-page edit' });
    await audit(deps.db, who.actor, { storeId: S, action: 'website.pageEdit.settings', entityType: 'Setting', entityId: 'shop.pageEdit', before, after: ok.data }, who.ctx);
  }
  return pageEditSettingsView(deps);
}

export async function pageEditSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LookDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    return json({ ok: true, ...(method === 'GET' ? await pageEditSettingsView(d) : await savePageEditSettings(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return e instanceof PageEditError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
