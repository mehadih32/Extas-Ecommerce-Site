// Follow-up 602 (PR 257) — the hourly sweep of tracked events still waiting, called by the background worker inside the
// server (packages/jobs tracking-sweep.ts) with the server's internal token (CACHE_HOOK_TOKEN, checked in the hook);
// Caddy answers 404 to /api/internal/ from outside. Nothing while `ads.tracking` is off (the worker plans none).
import { internalCaller } from '@/lib/marketing/audience-push';
import { trackingSweepHook } from '@/lib/tracking/service';

export const dynamic = 'force-dynamic';

// ~~export const POST = (request: Request) => trackingSweepHook(request);~~ — the internal token is checked here too
// (route review, PR 378), and again in the hook.
export const POST = (request: Request) => (internalCaller(request) ? trackingSweepHook(request) : Response.json({ ok: false, error: 'not-found' }, { status: 404 }));
