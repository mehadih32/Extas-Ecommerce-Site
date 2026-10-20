// PR 550 — the store's three delivery bands: charge, hours, on/off, the sub-area mode, places listed.
import { adminDeps } from '@/lib/admin-auth';
import { bandsHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return bandsHandler(request, adminDeps());
}
