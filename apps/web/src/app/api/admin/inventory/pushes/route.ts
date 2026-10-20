// PR 199, 200 — the documents sent to the ERP (?status=), with counts per state.
import { adminDeps } from '@/lib/admin-auth';
import { pushesHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return pushesHandler(request, adminDeps());
}
