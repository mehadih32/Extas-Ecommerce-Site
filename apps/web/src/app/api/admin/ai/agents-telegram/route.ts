// S15 · PR 584 — /api/admin/ai/agents-telegram: GET/POST the "Telegram commands" switch on `/admin/agents`.
// lib/admin-ai/telegram-routing-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { telegramRoutingHandler } from '@/lib/admin-ai/telegram-routing-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return telegramRoutingHandler(request, adminDeps());
}
export async function POST(request: Request) {
  return telegramRoutingHandler(request, adminDeps());
}
