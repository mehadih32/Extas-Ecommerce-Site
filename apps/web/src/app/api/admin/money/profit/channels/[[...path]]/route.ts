// S16 · PR 355 — Money → Profit by channel: the CSV (`books.read`) and the UTM words (`costs.write`); the rules are in
// lib/channel-profit-view.ts.
import { adminDeps } from '@/lib/admin-auth';
import { channelProfitRoute } from '@/lib/channel-profit-view';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = async (request: Request, ctx: Ctx) => channelProfitRoute(request, adminDeps(), (await ctx.params).path ?? []);
export const GET = handle;
export const PUT = handle;
export const POST = handle;
