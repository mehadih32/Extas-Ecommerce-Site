// S14 · PR 289 — Messages › Automations' API (lib/automations-api.ts lists every route).
import { adminDeps } from '@/lib/admin-auth';
import { automationsRoute } from '@/lib/automations-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => automationsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
