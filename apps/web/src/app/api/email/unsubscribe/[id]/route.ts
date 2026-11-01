// S14 · PR 290 — /api/email/unsubscribe/:id: an offer e-mail's unsubscribe (POST only: a link checker that opens the
// e-mail's links never unsubscribes anyone). The reader's mail app sends `List-Unsubscribe=One-Click` (RFC 8058) and gets
// 200; the shop's own page (/email/unsubscribe/:id) posts its form and is sent back to it, done. His "no" to offer
// e-mails is a dated consent record (@extas/messages email-track.ts); pressing again changes nothing.
import { emailUnsubscribe } from '@extas/messages';
import { adminDeps } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const deps = adminDeps();
  const { id } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const oneClick = form?.get('List-Unsubscribe') === 'One-Click';
  const ok = deps ? await emailUnsubscribe(deps.db, id, deps.now?.() ?? new Date()).catch(() => false) : false;
  if (oneClick) return new Response(null, { status: ok ? 200 : 404, headers: { 'cache-control': 'no-store' } });
  return new Response(null, { status: 303, headers: { location: `/email/unsubscribe/${encodeURIComponent(id)}?done=${ok ? 1 : 0}`, 'cache-control': 'no-store' } });
}
