// S28 · PR 695 — Marketing › Influencers & affiliates API. Paths: lib/marketing-affiliates-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { affiliatesRoute } from '@/lib/marketing-affiliates-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => affiliatesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
