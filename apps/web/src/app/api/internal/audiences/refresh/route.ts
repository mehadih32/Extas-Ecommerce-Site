// S13 · PR 264 — the daily audience refresh, called by the background worker inside the server (packages/jobs
// audience-refresh.ts) with the server's internal token (CACHE_HOOK_TOKEN); Caddy answers 404 to /api/internal/ from
// outside. Off until the owner turns on `ads.audienceRefresh`.
import { audienceRefreshHook } from '@/lib/marketing/audience-push';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => audienceRefreshHook(request);
