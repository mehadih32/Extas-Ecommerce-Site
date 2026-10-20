// PR 19 — variants by SKU (?sku=) or by product (?productId=); add one (?upsert=1 by SKU).
import { adminDeps } from '@/lib/admin-auth';
import { variantsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return variantsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return variantsHandler(request, adminDeps());
}
