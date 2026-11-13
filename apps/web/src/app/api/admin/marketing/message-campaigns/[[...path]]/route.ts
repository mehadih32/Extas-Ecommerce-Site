// S28 · PR 697 — Marketing › Message campaigns API. Paths: lib/marketing-message-campaigns-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { messageCampaignsRoute } from '@/lib/marketing-message-campaigns-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => messageCampaignsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
