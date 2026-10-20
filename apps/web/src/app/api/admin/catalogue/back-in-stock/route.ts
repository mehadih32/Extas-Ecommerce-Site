// PR 36 — waiting back-in-stock requests per product (counts only, no contacts).
import { adminDeps } from '@/lib/admin-auth';
import { backInStockHandler } from '@/lib/catalogue-tools-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return backInStockHandler(request, adminDeps());
}
