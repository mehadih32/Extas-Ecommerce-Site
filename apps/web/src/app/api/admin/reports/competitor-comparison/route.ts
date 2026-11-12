// S15 · PR 336 — the Competitor Teardown agent's second job (the comparison/report engine): reachable as soon as
// `reports.read` is held, ahead of any admin page (PR 337's saved/scheduled list is what gives it a home page).
import { adminDeps } from '@/lib/admin-auth';
import { competitorComparisonHandler } from '@/lib/admin-ai/competitor-comparison-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return competitorComparisonHandler(request, adminDeps());
}
