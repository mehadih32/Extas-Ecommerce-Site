// S02 · PR 602 — the deploy's hook (infra/deploy/deploy.sh, after the switch): a new version is live, so Cloudflare
// drops the pages it keeps. Needs the server's CACHE_HOOK_TOKEN; Caddy answers 404 to /api/internal/ from outside.
import { deployedHook } from '@/lib/cache-api';

export const dynamic = 'force-dynamic';

export const POST = deployedHook;
export const GET = deployedHook;
