// S08 · PR 185–191 — every returns and exchanges admin route (the board, one exchange and its decisions, an order's
// exchange choices and opening one). The table of paths is in lib/returns-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { returnsRoute } from '@/lib/returns-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => returnsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
