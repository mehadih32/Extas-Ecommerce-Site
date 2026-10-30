// PR 620 — GET / PUT /api/admin/integrations/erp-calls: the "The ERP asks the shop" card on Keys & connections (the
// address for the ERP, the switch, the latest calls). Every check is in lib/erp-calls-admin.ts.
import { adminDeps } from '@/lib/admin-auth';
import { erpCallsHandler } from '@/lib/erp-calls-admin';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpCallsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return erpCallsHandler(request, adminDeps());
}
