// PR 207 — check every stock number against the ERP (changes nothing).
import { adminDeps } from '@/lib/admin-auth';
import { reconcileHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return reconcileHandler(request, adminDeps());
}
