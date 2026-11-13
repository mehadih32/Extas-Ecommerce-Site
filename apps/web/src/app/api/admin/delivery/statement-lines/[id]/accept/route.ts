// S28 · PR 675 — "Accept the courier figure". Paths: lib/courier-statement-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { acceptFigureRoute } from '@/lib/courier-statement-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, ctx: Ctx) => acceptFigureRoute(request, adminDeps(), (await ctx.params).id);
