// S08 · PR 175 (SIM-F-027) — the RTO cost book: the shop's own returned parcels, both courier legs, every part not
// entered named; practice parcels never counted as real cost.
import { adminDeps } from '@/lib/admin-auth';
import { rtoCostRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return rtoCostRoute(request, adminDeps());
}
