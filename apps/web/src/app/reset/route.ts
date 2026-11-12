// CN-043 (11 Nov 2026, owner) — a public, no-JS, no-auth page for the one case the client-side "Start fresh" page
// (fresh-start/page.tsx) cannot reach: a browser whose old-WordPress service worker or cache keeps our own JS bundle
// from ever loading in the first place, so nothing of ours runs to clear anything. `Clear-Site-Data` here does include
// "cookies" (fresh-start.ts explains why that route avoids it): after go-live, this domain is only ours, and this page
// is a one-time, owner-given link, never the normal error path. Never indexed.
import { RESET_CLEAR_SITE_DATA, resetPageHtml } from '@/lib/legacy-browser';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return new Response(resetPageHtml(), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'clear-site-data': RESET_CLEAR_SITE_DATA,
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
