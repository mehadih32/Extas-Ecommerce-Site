// S22 · PR 425 — the support inbox: the list, one conversation, a reply or an internal note, take / give, solved /
// waiting / open, files, who can take conversations, and Support settings. The paths are in lib/support-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { supportRoute } from '@/lib/support-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => supportRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
