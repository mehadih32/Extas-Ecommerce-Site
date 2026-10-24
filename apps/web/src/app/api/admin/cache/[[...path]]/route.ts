// S02 · PR 602 — the Cache admin routes (SET-08b): the times each layer keeps a page, and "Clear all". The table of
// paths is in lib/cache-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { cacheRoute } from '@/lib/cache-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => cacheRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const PUT = run;
export const POST = run;
