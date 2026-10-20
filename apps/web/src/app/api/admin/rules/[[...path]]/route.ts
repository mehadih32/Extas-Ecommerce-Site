// S10 · PR 208–219 — every Smart Rules admin route (rules, drafts, preview, publish, history, simulation, conflicts,
// notices, coupons). The table of paths is in lib/rules-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { rulesRoute } from '@/lib/rules-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => rulesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
