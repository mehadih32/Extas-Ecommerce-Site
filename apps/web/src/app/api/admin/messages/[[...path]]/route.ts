// S05 · PR 148 — every Messages admin route (the order journey, a self-confirm reply). The table of paths is in
// lib/messages-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { messagesRoute } from '@/lib/messages-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => messagesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
