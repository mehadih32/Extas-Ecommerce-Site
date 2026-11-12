// S25 · PR 481 (Blueprint C8.1) — Marketing › Studio › Motion library at /admin/marketing/studio/motion, on
// /api/admin/marketing/studio/motion: list the starting set and the owner's own actions (`marketing.studio.read`);
// add, edit, archive and restore one (`marketing.studio.write`). This is a content library only — nothing here
// generates a clip (that is PR 482–486) or costs anything.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { createMotionAction, listMotionActions, setMotionActionArchived, StudioError, updateMotionAction, type MotionActionView, type StudioDeps } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface MotionOverview {
  actions: MotionActionView[];
}

export async function motionOverview(deps: StudioDeps): Promise<MotionOverview> {
  return { actions: await listMotionActions(deps, S) };
}

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * /api/admin/marketing/studio/motion — GET the library (`marketing.studio.read`); POST {action: 'create' | 'update' |
 * 'archive' | 'restore', ...} (`marketing.studio.write`).
 */
export async function motionHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await motionOverview(sd)) });
    if (b.action === 'create') return json({ ok: true, action: await createMotionAction(sd, who, b.input) });
    if (b.action === 'update') {
      if (!isUuidLike(b.id)) throw new StudioError('INVALID_INPUT', 'id required', ['id']);
      return json({ ok: true, action: await updateMotionAction(sd, who, b.id, b.patch) });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.id)) throw new StudioError('INVALID_INPUT', 'id required', ['id']);
      const row = await setMotionActionArchived(sd, who, b.id, b.action === 'archive');
      return json({ ok: true, action: row });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}

