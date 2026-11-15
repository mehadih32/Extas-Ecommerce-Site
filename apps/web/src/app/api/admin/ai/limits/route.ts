// PR 818 — /api/admin/ai/limits: POST {aiCapMinor | costSaver | costSaverAuto} (`ai.control`, written through the settings
// history). lib/admin-ai/limits.ts.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, body, errorResponse, fail, guardAdmin, json } from '@/lib/admin-auth';
import { isAiError } from '@/lib/admin-ai/errors';
import { setAiLimits } from '@/lib/admin-ai/limits';
import { requireOwnerPin } from '@/lib/owner-pin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  try {
    const b = await body(request);
    // The monthly ceiling is a money limit: the owner's PIN first (CLAUDE.md PIN rule; prototype m-ai.js asks it too).
    if ('aiCapMinor' in b) await requireOwnerPin(deps, g.actor, g.ctx, b.pin, 'ai.ceiling.change', MOTHER_STORE_ID);
    await setAiLimits({ resolver: deps.resolver }, { actor: g.actor, ctx: g.ctx }, b, MOTHER_STORE_ID);
    return json({ ok: true });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}
