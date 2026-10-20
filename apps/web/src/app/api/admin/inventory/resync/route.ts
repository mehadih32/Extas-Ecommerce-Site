// PR 206 — re-sync now: all stock ({full?}) or one product ({productId} / {sku}).
import { adminDeps } from '@/lib/admin-auth';
import { resyncHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return resyncHandler(request, adminDeps());
}
