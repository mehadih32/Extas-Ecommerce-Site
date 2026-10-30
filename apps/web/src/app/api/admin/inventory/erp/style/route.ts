// PR 609 — import from the ERP by style code: the preview (GET) and the import (POST).
import { adminDeps } from '@/lib/admin-auth';
import { erpStyleHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpStyleHandler(request, adminDeps());
}

export function POST(request: Request) {
  return erpStyleHandler(request, adminDeps());
}
