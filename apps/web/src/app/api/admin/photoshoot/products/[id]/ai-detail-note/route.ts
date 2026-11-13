// S15 · PR 332 — the photoshoot studio's own "find key details" job, reachable as soon as `photoshoot.generate`
// is held, ahead of the Studio page itself (PR 445+) that will one day put a button on this route.
import { adminDeps } from '@/lib/admin-auth';
import { studioDetailNoteHandler } from '@/lib/admin-ai/studio-detail-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return studioDetailNoteHandler(request, adminDeps(), (await ctx.params).id);
}
