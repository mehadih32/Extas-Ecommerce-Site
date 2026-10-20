// PR 36 — the back-in-stock requests with their contacts, and marking them (catalogue.interest).
import { adminDeps } from '@/lib/admin-auth';
import { backInStockRequestsHandler } from '@/lib/catalogue-tools-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return backInStockRequestsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return backInStockRequestsHandler(request, adminDeps());
}
