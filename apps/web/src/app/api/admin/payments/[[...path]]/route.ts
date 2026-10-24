// S07 · PR 165 — every payments admin route (an order's money, money recorded by staff). The table of paths is in
// lib/payments-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { paymentsRoute } from '@/lib/payments-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => paymentsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
