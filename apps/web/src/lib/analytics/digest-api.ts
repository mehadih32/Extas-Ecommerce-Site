// S15 · PR 341 — /api/admin/reports/analytics/digest: POST {kind: 'weekly' | 'monthly'} runs "Run now"
// (`reports.analytics.write`, the same permission PR 339's funnel CRUD already uses for this group) — builds (or
// reuses) the period's digest and sends it on whichever channel the owner turned on. Read only on every channel
// (rule 6): nothing here can move money, pause a campaign or touch an order.
import type { Actor, RequestContext } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { isDigestError, runDigestNow, type DigestDeps } from './digest';

export async function digestRunHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.analytics.write', storeId });
  if (g instanceof Response) return g;
  const d: DigestDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now };
  const who = { actor: g.actor as Actor, ctx: g.ctx as RequestContext };
  try {
    const b = await body(request).catch(() => ({}) as Record<string, unknown>);
    const { digest, created, sent } = await runDigestNow(d, who, storeId, b.kind);
    return json({ ok: true, digest, created, sent });
  } catch (e) {
    if (isDigestError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
