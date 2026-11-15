// PR 837 — the salaries and monthly costs list of Money › Costs (books.staffCosts).
import { adminDeps } from '@/lib/admin-auth';
import { staffCostsHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return staffCostsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return staffCostsHandler(request, adminDeps());
}
