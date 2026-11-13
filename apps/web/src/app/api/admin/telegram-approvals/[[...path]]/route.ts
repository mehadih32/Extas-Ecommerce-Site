// S28 · PR 703 — the Telegram approvals routes (lib/telegram-approvals.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { telegramApprovalsRoute } from '@/lib/telegram-approvals';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => telegramApprovalsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
