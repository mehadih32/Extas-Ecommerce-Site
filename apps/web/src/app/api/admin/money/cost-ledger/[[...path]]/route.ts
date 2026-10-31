// S16 · PR 343 — the cost ledger's admin routes (Money → Cost ledger): the CSV export, a prepaid top-up and its low mark.
// The table of paths is in lib/cost-ledger.ts.
import { adminDeps } from '@/lib/admin-auth';
import { costLedgerRoute } from '@/lib/cost-ledger';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => costLedgerRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
