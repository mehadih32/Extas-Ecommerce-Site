// S21 · PR 420 (B7.3) — /api/admin/health/fixes: GET the approval gate's page (`health.read`; ?show=waiting|decided);
// PUT {key: 'fixGate', value, version} saves its switches (`settings.write`); POST {action, ...}:
// - 'propose-fix' {findingId, fix, agentKey?} and 'propose-skill' {key, name, purpose?, content, changeNote?, agentKey?}
//   (`health.fixes.propose`, only while proposals are on);
// - 'approve' / 'reject' {id, reason?} (`health.fixes.approve`; never one's own proposal);
// - 'outcome' {findingId, outcome: fixed|rolled-back, note?} after an approved fix was re-tested (`health.fixes.propose`).
// The service checks each permission again (fixes.ts).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { decideProposal, fixesView, isFixGateError, proposeFix, proposeSkill, recordFixOutcome, saveFixGateCard } from './fixes';

export async function fixesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const view = await fixesView(d, who, { show: new URL(request.url).searchParams.get('show') });
      return json({ ok: true, view, cards: view.cards });
    }
    if (method === 'PUT') {
      const view = await saveFixGateCard(d, who, await body(request));
      return json({ ok: true, view, cards: view.cards });
    }
    const input = await body(request);
    const action = input.action;
    if (action === 'propose-fix') return json({ ok: true, ...(await proposeFix(d, who, input)) });
    if (action === 'propose-skill') return json({ ok: true, ...(await proposeSkill(d, who, input)) });
    if (action === 'approve' || action === 'reject') return json({ ok: true, ...(await decideProposal(d, who, { ...input, decision: action })) });
    if (action === 'outcome') return json({ ok: true, ...(await recordFixOutcome(d, who, input)) });
    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    if (isFixGateError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
