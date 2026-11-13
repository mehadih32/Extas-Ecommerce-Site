// S28 · PR 693 — Inbox › Comments API. Paths: lib/support-comments-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { commentsRoute } from '@/lib/support-comments-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => commentsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
