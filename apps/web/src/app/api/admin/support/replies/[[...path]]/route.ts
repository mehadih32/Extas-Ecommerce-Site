// S28 · PR 692 — Inbox › Quick replies API. Paths: lib/support-replies-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { savedRepliesRoute } from '@/lib/support-replies-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => savedRepliesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
