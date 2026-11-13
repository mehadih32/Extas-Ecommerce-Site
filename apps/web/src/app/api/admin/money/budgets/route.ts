// S28 · PR 688 — Finance › Costs & budgets: this month's budgets and the profit snapshot (GET), set budgets (POST).
import { adminDeps } from '@/lib/admin-auth';
import { budgetsHandler } from '@/lib/budgets-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return budgetsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return budgetsHandler(request, adminDeps());
}
