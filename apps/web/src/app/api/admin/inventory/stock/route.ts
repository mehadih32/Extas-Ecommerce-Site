// PR 195 — stock of one SKU in every location (?sku= or ?variantId=), or a product's colour × size grid (?productId=).
import { adminDeps } from '@/lib/admin-auth';
import { stockHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return stockHandler(request, adminDeps());
}
