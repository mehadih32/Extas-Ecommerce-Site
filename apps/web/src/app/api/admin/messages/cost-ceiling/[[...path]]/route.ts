// S28 · PR 698 — Messages › Cost ceilings API. Paths: lib/messages-ceiling-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { ceilingRoute } from '@/lib/messages-ceiling-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => ceilingRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
