// S14 · PR 290 — Messages › E-mail's API (lib/email-marketing-api.ts lists every route).
import { adminDeps } from '@/lib/admin-auth';
import { emailMarketingRoute } from '@/lib/email-marketing-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => emailMarketingRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
