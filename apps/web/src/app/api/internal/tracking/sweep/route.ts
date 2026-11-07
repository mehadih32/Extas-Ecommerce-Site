// Follow-up 602 (PR 257) — the hourly sweep of tracked events still waiting, called by the background worker inside the
// server (packages/jobs tracking-sweep.ts) with the server's internal token (CACHE_HOOK_TOKEN, checked in the hook);
// Caddy answers 404 to /api/internal/ from outside. Nothing while `ads.tracking` is off (the worker plans none).
// Follow-up 605 gap: each turn first records the purchases of orders paid without the gateway's return to the shop.
import { internalCaller } from '@/lib/marketing/audience-push';
import { trackingSweepHook, trackingDeps } from '@/lib/tracking/service';
import { catchUpPaidPurchases } from '@/lib/tracking/shop';

export const dynamic = 'force-dynamic';

// ~~export const POST = (request: Request) => trackingSweepHook(request);~~ — the internal token is checked here too
// (route review, PR 378), and again in the hook.
export const POST = (request: Request) => (internalCaller(request) ? trackingSweepHook(request, trackingDeps(), catchUpPaidPurchases) : Response.json({ ok: false, error: 'not-found' }, { status: 404 }));
