// S15 · PR 337 — /api/admin/reports/competitors: GET the saved list (`reports.read`); POST {action: 'create' |
// 'update' | 'archive' | 'restore', ...} (`reports.competitors.write`) — the same one-handler, action-body shape
// `motion-admin.ts` (PR 481) already uses for its own add/edit/archive/restore library.
import type { Actor, RequestContext } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { createCompetitor, listCompetitors, setCompetitorArchived, updateCompetitor, type CompetitorListDeps } from './competitor-list';
import { isAiError } from './errors';

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export async function competitorListHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const permission = method === 'GET' ? 'reports.read' : 'reports.competitors.write';
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  const d: CompetitorListDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') {
      const includeArchived = url.searchParams.get('includeArchived') === '1';
      return json({ ok: true, competitors: await listCompetitors(d, storeId, { includeArchived }) });
    }
    const b = await body(request).catch(() => ({}) as Record<string, unknown>);
    if (b.action === 'create') return json({ ok: true, competitor: await createCompetitor(d, who, storeId, b.input) });
    if (b.action === 'update') {
      if (!isUuidLike(b.id)) return fail(422, 'INVALID_INPUT', ['id']);
      return json({ ok: true, competitor: await updateCompetitor(d, who, storeId, b.id, b.patch) });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.id)) return fail(422, 'INVALID_INPUT', ['id']);
      return json({ ok: true, competitor: await setCompetitorArchived(d, who, storeId, b.id, b.action === 'archive') });
    }
    return fail(422, 'INVALID_INPUT', ['action']);
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
