// S28 · PR 671 — courier payouts through the courier's own payment request. Paths: lib/courier-payouts-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { payoutsRoute } from '@/lib/courier-payouts-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => payoutsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
