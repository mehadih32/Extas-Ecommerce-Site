// S15 · PR 339 — the saved funnel list: GET (`reports.read`), POST {action, ...} (`reports.analytics.write`).
import { adminDeps } from '@/lib/admin-auth';
import { funnelListHandler } from '@/lib/analytics/funnel-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return funnelListHandler(request, adminDeps());
}

export async function POST(request: Request) {
  return funnelListHandler(request, adminDeps());
}
