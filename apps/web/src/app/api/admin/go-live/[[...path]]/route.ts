// S19 · PR 393 (CN-031) — the go-live checklist's admin routes (Settings → System → Go-live). The table of paths is in
// lib/go-live-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { goLiveRoute } from '@/lib/go-live-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => goLiveRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
