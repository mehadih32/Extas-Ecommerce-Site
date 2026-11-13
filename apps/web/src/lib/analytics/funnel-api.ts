// S15 · PR 339 — /api/admin/reports/analytics/funnels: GET the saved list (`reports.read`); POST {action: 'create'
// | 'update' | 'archive' | 'restore', ...} (`reports.analytics.write`) — the same one-handler, action-body shape
// `competitor-list-api.ts` (PR 337) and `motion-admin.ts` (PR 481) already use for add/edit/archive/restore.
// /api/admin/reports/analytics/funnels/[id]/run: GET that funnel's own count over a window (`reports.read`); a
// window is read-only and never saved, so it needs no write permission even though it reads live event rows.
import type { Actor, RequestContext } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { createFunnel, isFunnelError, listFunnels, setFunnelArchived, updateFunnel, type FunnelListDeps } from './funnel-list';
import { defaultFunnelWindow, runFunnel, type FunnelRunDeps } from './funnel-run';

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

function timeOf(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function funnelListHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const permission = method === 'GET' ? 'reports.read' : 'reports.analytics.write';
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  const d: FunnelListDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') {
      const includeArchived = url.searchParams.get('includeArchived') === '1';
      return json({ ok: true, funnels: await listFunnels(d, storeId, { includeArchived }) });
    }
    const b = await body(request).catch(() => ({}) as Record<string, unknown>);
    if (b.action === 'create') return json({ ok: true, funnel: await createFunnel(d, who, storeId, b.input) });
    if (b.action === 'update') {
      if (!isUuidLike(b.id)) return fail(422, 'INVALID_INPUT', ['id']);
      return json({ ok: true, funnel: await updateFunnel(d, who, storeId, b.id, b.patch) });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.id)) return fail(422, 'INVALID_INPUT', ['id']);
      return json({ ok: true, funnel: await setFunnelArchived(d, who, storeId, b.id, b.action === 'archive') });
    }
    return fail(422, 'INVALID_INPUT', ['action']);
  } catch (e) {
    if (isFunnelError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

export async function funnelRunHandler(request: Request, deps: AdminDeps | null, funnelId: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  if (!isUuidLike(funnelId)) return fail(422, 'INVALID_INPUT', ['id']);
  const rd: FunnelRunDeps = { db: deps!.db };
  try {
    const now = deps!.now?.() ?? new Date();
    const window = defaultFunnelWindow(now, timeOf(url.searchParams.get('from')), timeOf(url.searchParams.get('to')));
    return json({ ok: true, result: await runFunnel(rd, storeId, funnelId, window) });
  } catch (e) {
    if (isFunnelError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
