// PR 196 — which company does the ERP key belong to? The practice company is shown, never saved.
import { adminDeps } from '@/lib/admin-auth';
import { erpVerifyHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return erpVerifyHandler(request, adminDeps());
}
