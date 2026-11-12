// S15 · PR 337 — walks a saved competitor's own page again, saves a new report diffed against the last one.
import { adminDeps } from '@/lib/admin-auth';
import { competitorRecheckHandler } from '@/lib/admin-ai/competitor-recheck-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return competitorRecheckHandler(request, adminDeps());
}
