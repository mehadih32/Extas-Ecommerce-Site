// S15 · PR 337 — /api/admin/reports/competitors/recheck: POST {id, locale?} (`reports.competitors.write`) walks
// the saved competitor's own page again and saves a new report, diffed against the last one.
// /api/admin/reports/competitors/[id]/reports: GET that competitor's own report history (`reports.read`).
import type { Actor, RequestContext } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../catalogue-api';
import { isAiError } from './errors';
import { COMPETITOR_REPORTS_DEFAULT_ROWS, listCompetitorReports, recheckCompetitor, type RecheckDeps } from './competitor-recheck';

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export async function competitorRecheckHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.competitors.write', storeId });
  if (g instanceof Response) return g;
  try {
    const input = await body(request);
    if (!isUuidLike(input.id)) return fail(422, 'INVALID_INPUT', ['id']);
    const locale = input.locale === 'bn' ? 'bn' : 'en';
    const rd: RecheckDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, now: deps!.now };
    const who = { actor: g.actor as Actor, ctx: g.ctx as RequestContext };
    const out = await recheckCompetitor(rd, who, storeId, input.id, locale);
    return json({ ok: true, ...out });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

export async function competitorReportsHandler(request: Request, deps: AdminDeps | null, competitorId: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  if (!isUuidLike(competitorId)) return fail(422, 'INVALID_INPUT', ['id']);
  try {
    const limitRaw = Number(url.searchParams.get('limit') ?? String(COMPETITOR_REPORTS_DEFAULT_ROWS));
    const reports = await listCompetitorReports({ db: deps!.db }, storeId, competitorId, Number.isFinite(limitRaw) ? limitRaw : COMPETITOR_REPORTS_DEFAULT_ROWS);
    return json({ ok: true, reports });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
