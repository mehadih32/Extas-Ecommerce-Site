// S08 · PR 525 — the true-delivery checks: the list by view, and a person's resolution of one. The paths are in
// lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { checksRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => checksRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
