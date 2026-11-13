// S28 · PR 706 (CN-049) — the Practice data routes (lib/practice/api.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { practiceRoute } from '@/lib/practice/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => practiceRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
