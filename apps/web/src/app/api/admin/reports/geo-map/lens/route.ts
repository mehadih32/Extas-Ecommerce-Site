// S29 · PR 757 — the courier and coverage lens (reports.read; advice only). See lib/geo-map/lens-route.ts.
import { adminDeps } from '@/lib/admin-auth';
import { lensRoute } from '@/lib/geo-map/lens-route';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return lensRoute(request, adminDeps());
}
