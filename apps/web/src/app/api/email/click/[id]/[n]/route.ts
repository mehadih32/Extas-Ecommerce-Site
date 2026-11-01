// S14 · PR 290 — /api/email/click/:id/:n: a click on an offer e-mail's link number n (only in e-mails sent while click
// tracking was on). Counted (@extas/messages email-track.ts), then the reader goes on to that link — always one of the
// template's own links, never an address from the request (no open redirect); an unknown e-mail or link goes home.
import { emailClicked } from '@extas/messages';
import { adminDeps } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string; n: string }> }): Promise<Response> {
  const deps = adminDeps();
  const { id, n } = await ctx.params;
  const to = deps && /^\d{1,3}$/.test(n) ? await emailClicked({ db: deps.db, settings: deps.resolver }, id, Number(n), deps.now?.() ?? new Date()).catch(() => null) : null;
  return new Response(null, { status: 302, headers: { location: to ?? '/', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}
