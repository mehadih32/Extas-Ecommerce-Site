// S16 · PR 345 — the costs & fees admin routes (Money → Costs & fees). The table of paths is in lib/fees-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { feesRoute } from '@/lib/fees-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => feesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
