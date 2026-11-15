// PR 785 (prototype v5 parity, Stock › "Download stock list"): every live size with its pieces as a CSV file.
import { adminDeps } from '@/lib/admin-auth';
import { stockListHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return stockListHandler(request, adminDeps());
}
