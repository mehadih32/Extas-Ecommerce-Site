// PR 1040 (final round D14) — Finance › Costs: a person's advance, bonus or deduction as a NEW ROW (never an edit), with the owner's PIN.
import { adminDeps } from '@/lib/admin-auth';
import { staffRowsHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return staffRowsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return staffRowsHandler(request, adminDeps());
}
