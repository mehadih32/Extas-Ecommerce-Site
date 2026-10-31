// PR 12 (CN-032) — POST {"level":"soft"|"full"}: clears this site's saved data in the asking browser (lib/fresh-start.ts).
// POST only, so a link can never sign someone out; the answer is never cached.
import { CLEAR_SITE_DATA, cookieNames, expireCookies, isFreshLevel } from '@/lib/fresh-start';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { level?: unknown } | null;
  const level = isFreshLevel(body?.level) ? body.level : 'soft';
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', 'clear-site-data': CLEAR_SITE_DATA });
  if (level === 'full') {
    const secure = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
    for (const line of expireCookies(cookieNames(request.headers.get('cookie')), secure)) headers.append('set-cookie', line);
  }
  return new Response(JSON.stringify({ ok: true, level }), { headers });
}
