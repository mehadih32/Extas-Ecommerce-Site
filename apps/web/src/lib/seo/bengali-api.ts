// S11 · PR 588 — /api/admin/seo/bengali (Website › SEO › Bengali pages):
//   GET   the Bengali coverage: every page that could be listed, its Bengali text and whether it is ready (seo.read)
//   POST  { keys, ready, version } marks pages ready (only those with Bengali text) or not ready (seo.manage, audited)
//   PUT   { key: 'gate', value, version } what a Bengali page that is not ready shows (seo.manage, audited)
// The service (lib/seo/bengali.ts) checks each permission again. Nothing here moves money or touches an order.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { bengaliCoverage, isBengaliError, saveBengaliGate, setBengaliReady, type BengaliCoverage } from './bengali';

const answer = (e: unknown): Response => (isBengaliError(e) ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));
const reply = (cov: BengaliCoverage) => json({ ok: true, coverage: cov, cards: { gate: cov.gate } });

export async function bengaliHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'seo.read' : 'seo.manage', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return reply(await bengaliCoverage(d));
    if (method === 'POST') return reply(await setBengaliReady(d, who, await body(request)));
    return reply(await saveBengaliGate(d, who, await body(request)));
  } catch (e) {
    return answer(e);
  }
}
