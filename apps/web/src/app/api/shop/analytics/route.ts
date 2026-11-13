// S15 · PR 338 — the shop's analytics beacon: public, same-site only, size-capped (lib/analytics/ingest.ts). Records
// one shopper event into the shop's own database; nothing sent to an outside service.
import { analyticsApiDeps } from '@/lib/analytics/deps';
import { analyticsIngestHandler } from '@/lib/analytics/ingest';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return analyticsIngestHandler(request, analyticsApiDeps());
}
