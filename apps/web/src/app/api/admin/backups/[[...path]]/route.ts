// S19 · PR 395 (CN-030) — the Backups admin routes (Settings → System → Backups): the one-click Google Drive. The table
// of paths is in lib/backups-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { backupsRoute } from '@/lib/backups-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => backupsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
