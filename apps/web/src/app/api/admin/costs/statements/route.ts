// Follow-up 565 (PR 618) — the "Costs from statements" card of Money › Costs (books.costs.fromStatements).
import { adminDeps } from '@/lib/admin-auth';
import { statementCostsHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return statementCostsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return statementCostsHandler(request, adminDeps());
}
