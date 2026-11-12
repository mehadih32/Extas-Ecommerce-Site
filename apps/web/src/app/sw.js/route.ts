// CN-043 (11 Nov 2026, owner) — the old WordPress shop's plugins sometimes registered a service worker at this path.
// Answering here with a self-unregistering, self-clearing one (lib/legacy-browser.ts) stops it intercepting requests
// in a browser that still has it, even though our app never registered one at this path itself.
import { LEGACY_SERVICE_WORKER_SCRIPT } from '@/lib/legacy-browser';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return new Response(LEGACY_SERVICE_WORKER_SCRIPT, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
}
