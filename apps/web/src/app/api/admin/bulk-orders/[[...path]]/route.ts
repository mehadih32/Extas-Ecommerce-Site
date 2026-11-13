// S28 · PR 704 — the bulk and corporate orders routes (lib/bulk-orders.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { bulkOrdersRoute } from '@/lib/bulk-orders';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => bulkOrdersRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
