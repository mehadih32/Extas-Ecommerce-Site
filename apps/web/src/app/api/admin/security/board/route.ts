// PR 815 — /api/admin/security/board: POST {action: block | unblock | signOut | twoFactor, …} (`security.write`; a block and turning 2-step off
// need the owner's PIN). lib/admin-security/board.ts.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, body, errorResponse, fail, guardAdmin, json } from '@/lib/admin-auth';
import { boardAct, BoardError } from '@/lib/admin-security/board';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'security.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  try {
    await boardAct(deps, { actor: g.actor, ctx: g.ctx, sessionId: g.auth.session.id }, await body(request));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof BoardError) return fail(e.status, e.code, e.details.length ? e.details : undefined);
    return errorResponse(e);
  }
}
