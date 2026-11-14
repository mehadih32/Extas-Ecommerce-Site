// S28 · PR 713 — POST /api/admin/ai/training/extras (`ai.control`): {action:'tryIt', agent, sample} answers what the agent would say (never
// while AI is off, nothing saved or sent), {action:'saveExample', agent, sample, better} / 'addDoc' {agent,title,text} / 'editDoc' {id,text} /
// 'removeDoc' {id} / 'addNote' {agent,text} save rows. lib/admin-ai/training-extras.ts.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { aiAgentDef, isAiAgentKey } from './agents';
import { isAiError } from './errors';
import { changeExtras, tryIt } from './training-extras';

export async function extrasHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const b = await body(request);
    if (b.action === 'tryIt') {
      const name = (k: string) => (isAiAgentKey(k) ? aiAgentDef(k).nameEn : k);
      const r = await tryIt({ db: d.db, resolver: d.resolver, vault: d.vault, now: d.now }, b, name, b.locale === 'bn' ? 'bn' : 'en');
      return json({ ok: true, ...r });
    }
    await changeExtras({ db: d.db }, { actor: g.actor, ctx: g.ctx }, b);
    return json({ ok: true });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
