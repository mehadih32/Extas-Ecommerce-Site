// S28 · PR 701 — the behaviour analytics routes (lib/analytics/behaviour.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { behaviourRoute } from '@/lib/analytics/behaviour';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => behaviourRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
