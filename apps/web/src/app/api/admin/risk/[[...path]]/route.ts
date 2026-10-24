// S06 · PR 544 — the risk rules admin routes (the list of every fraud and duplicate rule and their switches). The table
// of paths is in lib/risk-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { riskRoute } from '@/lib/risk-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => riskRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const PUT = run;
export const POST = run;
