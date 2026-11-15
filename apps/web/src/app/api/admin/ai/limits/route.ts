// PR 818 — /api/admin/ai/limits: POST {aiCapMinor | costSaver | costSaverAuto} (`ai.control`, written through the settings
// history). lib/admin-ai/limits.ts.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, body, errorResponse, fail, guardAdmin, json } from '@/lib/admin-auth';
import { isAiError } from '@/lib/admin-ai/errors';
import { setAiLimits } from '@/lib/admin-ai/limits';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  try {
    await setAiLimits({ resolver: deps.resolver }, { actor: g.actor, ctx: g.ctx }, await body(request), MOTHER_STORE_ID);
    return json({ ok: true });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
