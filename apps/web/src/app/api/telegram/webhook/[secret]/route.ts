// S28 · PR 703 — Telegram's own calls (a tap on Approve or Reject, the PIN typed in the chat). The address holds a keyed
// hash of the bot token; a wrong one, or a bot that is not connected live, is a plain 404 (lib/telegram-approvals.ts).
import { adminDeps } from '@/lib/admin-auth';
import { telegramWebhook } from '@/lib/telegram-approvals';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ secret: string }> };

export const POST = async (request: Request, ctx: Ctx) => telegramWebhook(request, adminDeps(), (await ctx.params).secret);
