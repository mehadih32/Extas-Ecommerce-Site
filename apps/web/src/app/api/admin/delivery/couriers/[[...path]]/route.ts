// S08 · PR 175 — the store's courier accounts (list, add, rename, switch on or off, archive). The paths are in
// lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { couriersRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => couriersRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PATCH = run;
