// S28 · PR 702 — the staff controls routes (lib/staff-controls.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { staffControlsRoute } from '@/lib/staff-controls';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => staffControlsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
