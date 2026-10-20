// PR 204 — the publish queue with each product's real ERP stock.
import { adminDeps } from '@/lib/admin-auth';
import { publishQueueHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return publishQueueHandler(request, adminDeps());
}
