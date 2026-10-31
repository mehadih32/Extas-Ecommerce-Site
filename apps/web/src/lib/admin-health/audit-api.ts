// S21 · PR 570 (B7.3) — /api/admin/ai/audit: GET the checklist audit's page (`health.read`); PUT {key: 'audit', value,
// version} saves the runner's switches; POST {action: 'run'} records "Run now" (both `settings.write`, checked again in
// audit.ts). Nothing here starts a browser or fixes anything; the server's hourly check runs the audit.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { askAuditRun, auditView, isAuditError, saveAuditCard } from './audit';

export async function auditHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now, ...opts };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const view = await auditView(d, who);
      return json({ ok: true, view, cards: view.cards });
    }
    if (method === 'PUT') {
      const view = await saveAuditCard(d, who, await body(request));
      return json({ ok: true, view, cards: view.cards });
    }
    const input = await body(request);
    if (input.action !== 'run') return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
    const view = await askAuditRun(d, who);
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isAuditError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
