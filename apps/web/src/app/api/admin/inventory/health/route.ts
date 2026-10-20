// PR 205 — the sync health panel: last runs, what failed, what is queued (never calls the ERP).
import { adminDeps } from '@/lib/admin-auth';
import { healthHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return healthHandler(request, adminDeps());
}
