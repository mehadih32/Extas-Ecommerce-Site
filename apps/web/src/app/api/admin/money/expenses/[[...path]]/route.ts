// S16 · PR 344 — the expenses admin routes (Money → Expenses): a quick expense on a head, its reversal, the heads.
// The table of paths is in lib/expenses-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { expensesRoute } from '@/lib/expenses-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => expensesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
