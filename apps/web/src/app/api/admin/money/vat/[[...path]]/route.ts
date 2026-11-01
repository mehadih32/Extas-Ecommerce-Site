// S16 · PR 350 — the VAT admin routes (Money → VAT). The table of paths is in lib/vat-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { vatRoute } from '@/lib/vat-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => vatRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const PUT = run;
