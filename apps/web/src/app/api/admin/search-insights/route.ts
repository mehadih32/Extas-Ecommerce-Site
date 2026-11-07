// PR 72 follow-up 100 — Reports › Searches › More options: the "What shoppers search for" card (lib/search-insights-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { insightsHandler } from '@/lib/search-insights-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return insightsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return insightsHandler(request, adminDeps());
}
