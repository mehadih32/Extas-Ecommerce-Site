// PR 817 — the Telegram control routes (lib/telegram-control.ts holds the table of paths).
import { adminDeps } from '@/lib/admin-auth';
import { telegramControlRoute } from '@/lib/telegram-control';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => telegramControlRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
