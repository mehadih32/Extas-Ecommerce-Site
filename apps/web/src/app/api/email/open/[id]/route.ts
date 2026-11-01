// S14 · PR 290 — /api/email/open/:id: an offer e-mail's one-pixel image (only in e-mails sent while open tracking was on).
// The first open is kept (@extas/messages email-track.ts). Always the same transparent pixel, whatever the id, so the
// address tells nobody anything; never cached, never a cookie.
import { emailOpened } from '@extas/messages';
import { adminDeps } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const deps = adminDeps();
  const { id } = await ctx.params;
  if (deps) await emailOpened(deps.db, id, deps.now?.() ?? new Date()).catch(() => undefined);
  return new Response(PIXEL, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, max-age=0', 'x-robots-tag': 'noindex' } });
}
