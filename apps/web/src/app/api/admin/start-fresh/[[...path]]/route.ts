// S28 · PR 706 — the Start fresh routes (lib/start-fresh.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { startFreshRoute } from '@/lib/start-fresh';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => startFreshRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
