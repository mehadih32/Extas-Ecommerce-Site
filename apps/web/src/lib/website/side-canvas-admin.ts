// S02 · PR 596 (BACKEND-ARCHITECTURE WEB-02a) — Website › Side canvas, the server side: the master switch with its
// numbers (`layout.sideCanvas`, off as shipped) and the zones (`layout.sideZones`) with the version they were read at,
// and saving both. A save is checked against the settings' schemas, never drops a zone (a zone is hidden, never
// deleted), is refused when someone saved in between (STALE), and is audited (`website.sidecanvas.save`, before and
// after). Seeing needs `website.read`, saving `website.layout.write` (the page layouts' own permission). Nothing here
// touches a price, an order or a customer.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry, storeTarget, type SideCanvas, type SideZone } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { LayoutError, type LayoutDeps, type LayoutWho } from './layouts-admin';

const S = MOTHER_STORE_ID;

export interface SideView {
  canvas: SideCanvas;
  zones: SideZone[];
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16);

export async function sideView(deps: LayoutDeps): Promise<SideView> {
  const [canvas, zones] = await Promise.all([deps.resolver.value('layout.sideCanvas', { storeId: S }), deps.resolver.value('layout.sideZones', { storeId: S })]);
  return { canvas: canvas as SideCanvas, zones: zones as SideZone[], version: versionOf([canvas, zones]) };
}

/** PUT {canvas, zones, version}: the switch, its numbers and every zone (none dropped). Audited; nothing written when unchanged. */
export async function saveSide(deps: LayoutDeps, who: LayoutWho, input: unknown): Promise<SideView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const canvas = registry['layout.sideCanvas'].schema.safeParse(o.canvas);
  if (!canvas.success) throw new LayoutError('INVALID_INPUT', 400, ['canvas']);
  const zones = registry['layout.sideZones'].schema.safeParse(o.zones);
  if (!zones.success) throw new LayoutError('INVALID_INPUT', 400, ['zones']);
  const before = await sideView(deps);
  if (o.version !== before.version) throw new LayoutError('STALE', 409);
  const kept = new Set(zones.data.map((z) => z.id));
  if (before.zones.some((z) => !kept.has(z.id))) throw new LayoutError('INVALID_INPUT', 400, ['zones']);
  const how = { actorId: who.actor.staffUserId ?? null, reason: 'Website › Side canvas' };
  const changed: string[] = [];
  if (versionOf(canvas.data) !== versionOf(before.canvas)) {
    await deps.resolver.set('layout.sideCanvas', canvas.data, storeTarget(S), how);
    changed.push('layout.sideCanvas');
  }
  if (versionOf(zones.data) !== versionOf(before.zones)) {
    await deps.resolver.set('layout.sideZones', zones.data, storeTarget(S), how);
    changed.push('layout.sideZones');
  }
  if (changed.length)
    await audit(deps.db, who.actor, { storeId: S, action: 'website.sidecanvas.save', entityType: 'Setting', entityId: changed.join(','), before: { canvas: before.canvas, zones: before.zones }, after: { canvas: canvas.data, zones: zones.data } }, who.ctx);
  return sideView(deps);
}

/** /api/admin/website/side-canvas — GET (`website.read`); PUT (`website.layout.write`). */
export async function sideCanvasHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LayoutDeps = { db: deps!.db, resolver: deps!.resolver };
  try {
    return json({ ok: true, ...(method === 'GET' ? await sideView(d) : await saveSide(d, { actor: g.actor, ctx: g.ctx }, b)) });
  } catch (e) {
    return e instanceof LayoutError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
