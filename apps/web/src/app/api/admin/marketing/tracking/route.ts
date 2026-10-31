// S13 · PR 257 — Marketing › Tracking: the overview (GET, `ads.tracking.read`), the settings card (PUT) and the test
// event or "send waiting now" (POST), both `ads.tracking.manage` (lib/tracking/admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { trackingHandler } from '@/lib/tracking/admin';
import { originOf } from '@/lib/tracking/model';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return trackingHandler(request, adminDeps(), originOf(request));
}

export function POST(request: Request) {
  return trackingHandler(request, adminDeps(), originOf(request));
}

export function PUT(request: Request) {
  return trackingHandler(request, adminDeps(), originOf(request));
}
