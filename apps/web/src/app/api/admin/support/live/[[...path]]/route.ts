// S28 · PR 694 — Inbox › Comments › Live selling API. Paths: lib/support-live-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { liveRoute } from '@/lib/support-live-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => liveRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
