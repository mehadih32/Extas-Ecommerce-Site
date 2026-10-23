// S05 · PR 138, 144, 145, 147, 153 — every order admin route (the list, one order, its commands, notes and flags, the
// duplicate review queue and one-parcel merge). The table of paths is in lib/orders-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { ordersRoute } from '@/lib/orders-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => ordersRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
