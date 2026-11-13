// S28 · PR 700 — the visitors analytics routes (lib/analytics/visitors.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { visitorsRoute } from '@/lib/analytics/visitors';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => visitorsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
