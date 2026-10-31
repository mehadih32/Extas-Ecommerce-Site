// Go-live gate F-041 / F-054 — Money › Refunds & wallet (GET `payments.view`; PUT one money rule `settings.write`);
// lib/money-refunds-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { refundsHandler } from '@/lib/money-refunds-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return refundsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return refundsHandler(request, adminDeps());
}
