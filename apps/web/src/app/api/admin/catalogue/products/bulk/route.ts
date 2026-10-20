// PR 21 — bulk actions on products: publish, unpublish, recheck, archive, restore (each product on its own).
import { adminDeps } from '@/lib/admin-auth';
import { productsBulkHandler } from '@/lib/catalogue-publish-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return productsBulkHandler(request, adminDeps());
}
