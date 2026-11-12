// CN-043 (11 Nov 2026, owner) — a common legacy service-worker path (old WordPress plugins and push SDKs). Same
// self-unregistering, self-clearing worker as sw.js/route.ts (lib/legacy-browser.ts); kept as its own tiny file so
// each well-known path is a real route, not a rewrite that could confuse an old registration's own scope.
import { LEGACY_SERVICE_WORKER_SCRIPT } from '@/lib/legacy-browser';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return new Response(LEGACY_SERVICE_WORKER_SCRIPT, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
}
