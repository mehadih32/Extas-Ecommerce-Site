// S13 · PR 265 — the daily ad spend import, called by the background worker inside the server (packages/jobs
// ad-spend-import.ts) with the server's internal token (CACHE_HOOK_TOKEN, checked by internalCaller here and again in
// the hook); Caddy answers 404 to /api/internal/ from outside. Off until the owner turns on `ads.spendImport`.
import { fail } from '@/lib/admin-auth';
import { spendImportHook } from '@/lib/marketing/ad-spend';
import { internalCaller } from '@/lib/marketing/audience-push';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => (internalCaller(request) ? spendImportHook(request) : fail(404, 'not-found'));
