// S28 · PR 705 — the activity log route (lib/activity-log.ts holds the rules): a read, with an optional CSV download.
import { adminDeps } from '@/lib/admin-auth';
import { activityRoute } from '@/lib/activity-log';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

export const GET = async (request: Request, ctx: Ctx) => activityRoute(request, adminDeps(), (await ctx.params).path ?? []);
