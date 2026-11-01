// S14 · PR 284 — every customers admin route (the single view, the merge rules' suggestions, merges and splits, the
// number's copy and call log). The table of paths is in lib/customers-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { customersRoute } from '@/lib/customers-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => customersRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
