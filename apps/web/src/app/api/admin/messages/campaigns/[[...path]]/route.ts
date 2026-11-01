// S14 · PR 300 — Messages › Campaigns' API (lib/campaigns-api.ts lists every route).
import { adminDeps } from '@/lib/admin-auth';
import { campaignsRoute } from '@/lib/campaigns-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => campaignsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
