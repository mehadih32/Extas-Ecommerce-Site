// S21 · PR 418 (REP-07e) — /api/admin/health/smoke: GET Reports › Site health › Smoke runs (`health.read`; ?run=deploy|
// scheduled, ?show=failed|all), and /api/admin/health/smoke/shot?run=…&file=… one page's picture (an admin page's also
// needs `health.smoke.shots`). Read-only; the service checks each permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isSmokePageError, smokeRunsView, smokeShot } from './smoke-runs';

export async function smokeHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const q = new URL(request.url).searchParams;
  try {
    const view = await smokeRunsView({ db: deps!.db, ...opts }, { actor: g.actor, ctx: g.ctx }, { slot: q.get('run'), show: q.get('show') });
    return json({ ok: true, view });
  } catch (e) {
    if (isSmokePageError(e)) return json({ ok: false, error: e.code }, { status: e.status });
    return errorResponse(e);
  }
}

export async function smokeShotHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const q = new URL(request.url).searchParams;
  try {
    const bytes = await smokeShot({ db: deps!.db, ...opts }, { actor: g.actor, ctx: g.ctx }, q.get('run'), q.get('file'));
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' },
    });
  } catch (e) {
    if (isSmokePageError(e)) return json({ ok: false, error: e.code }, { status: e.status });
    return errorResponse(e);
  }
}
