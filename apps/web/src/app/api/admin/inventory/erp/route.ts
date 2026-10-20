// PR 497, 196 — the store's ERP mode, mapping and sync state; PUT switches the mode or saves the mapping.
import { adminDeps } from '@/lib/admin-auth';
import { erpHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return erpHandler(request, adminDeps());
}
