// S03 · PR 90 (with 571, 99, 575, 104) — every combo admin route (fixed combos, auto colour-pair rules, set photos,
// the report). The table of paths is in lib/combos-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { combosRoute } from '@/lib/combos-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => combosRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
