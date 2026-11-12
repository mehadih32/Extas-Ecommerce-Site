// S25 · PR 485 (Blueprint C8.1) — Marketing › Studio › Reels at /admin/marketing/studio/reels: builds a reel from a
// handful of already-APPROVED clips (PR 484's review/approve step), an optional music track, text/logo overlay
// choices and the output shapes to cut it for. GET lists built reels and the pickable approved clips
// (`marketing.studio.read`); POST {action: 'build', input} builds one, or {action: 'archive' | 'restore', reelId}
// sets a still-DRAFT reel aside or brings it back (`marketing.studio.write`). Nothing is composited yet — that is
// PR 486.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import { approvedClipsForReel, buildReel, listReels, setReelArchived, StudioError, type ReelView, type StudioDeps } from '@extas/creative-studio';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export interface ReelsOverview {
  reels: ReelView[];
  approvedClips: { id: string; productId: string | null; aspect: string | null }[];
}

export async function reelsOverview(deps: AdminDeps, sd: StudioDeps): Promise<ReelsOverview> {
  const [reels, approvedClips] = await Promise.all([listReels(sd, S), approvedClipsForReel(deps.db, S)]);
  return { reels, approvedClips };
}

const isUuidLike = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * /api/admin/marketing/studio/reels — GET the overview (`marketing.studio.read`); POST {action: 'build', input} or
 * {action: 'archive' | 'restore', reelId} (`marketing.studio.write`).
 */
export async function reelsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.studio.read' : 'marketing.studio.write';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const sd: StudioDeps = { db: deps!.db };
  const who = { actor: g.actor as Actor, storeId: S, ctx: g.ctx as RequestContext };
  try {
    if (method === 'GET') return json({ ok: true, ...(await reelsOverview(deps!, sd)) });
    if (b.action === 'build') return json({ ok: true, reel: await buildReel(sd, who, b.input) });
    if (b.action === 'archive' || b.action === 'restore') {
      if (!isUuidLike(b.reelId)) throw new StudioError('INVALID_INPUT', 'a reel id is needed', ['reelId']);
      return json({ ok: true, reel: await setReelArchived(sd, who, b.reelId, b.action === 'archive') });
    }
    throw new StudioError('INVALID_INPUT', 'unknown action', ['action']);
  } catch (e) {
    return errorResponse(e);
  }
}
