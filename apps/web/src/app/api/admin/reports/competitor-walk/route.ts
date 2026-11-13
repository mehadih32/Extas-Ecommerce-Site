// S15 · PR 335 — the Competitor Teardown agent's own first job (the "journey walker" alone): reachable as soon as
// `reports.read` is held, ahead of any admin page (PR 336's comparison/report engine is what gives it something
// worth showing).
import { adminDeps } from '@/lib/admin-auth';
import { competitorWalkHandler } from '@/lib/admin-ai/competitor-journey-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return competitorWalkHandler(request, adminDeps());
}
