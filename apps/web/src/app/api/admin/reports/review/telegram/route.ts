// PR 891 — "Send to Telegram" on Reports › Monthly review (`reports.analytics.write`).
import { adminDeps } from '@/lib/admin-auth';
import { reviewTelegramHandler } from '@/lib/analytics/review-telegram-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return reviewTelegramHandler(request, adminDeps());
}
