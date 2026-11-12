// S15 · PR 341 — "Run now": POST {kind} (`reports.analytics.write`).
import { adminDeps } from '@/lib/admin-auth';
import { digestRunHandler } from '@/lib/analytics/digest-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return digestRunHandler(request, adminDeps());
}
