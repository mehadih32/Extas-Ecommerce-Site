// S21 · PR 423 (CN-015) — /api/admin/health/problems: GET the Customer problems list for `?when=` (today, yesterday,
// week, all or a day; `health.read`); PUT {key: 'problems', value, version} saves the recorder's numbers
// (`settings.write`). /api/admin/health/problems/<id>: GET one problem; POST {status, note, version} sets its status
// (`health.problems.manage`; the owner's steps `health.problems.approve`). The service checks each permission again.
// Nothing here blocks anyone or changes the shop.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { parseWhen } from './days';
import { isProblemsError, problemDetail, problemsView, saveProblemsCard, setProblemStatus } from './service';

const answer = (e: unknown): Response => (isProblemsError(e) ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

export async function problemsListHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, {
    permission: 'health.read',
    storeId: MOTHER_STORE_ID,
  });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const view = method === 'GET' ? await problemsView(d, who, parseWhen(new URL(request.url).searchParams.get('when') ?? undefined)) : await saveProblemsCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    return answer(e);
  }
}

export async function problemHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, {
    permission: 'health.read',
    storeId: MOTHER_STORE_ID,
  });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const detail = method === 'GET' ? await problemDetail(d, who, id) : await setProblemStatus(d, who, id, await body(request));
    return json({ ok: true, detail });
  } catch (e) {
    return answer(e);
  }
}
