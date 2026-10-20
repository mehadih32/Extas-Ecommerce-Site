// PR 36 — public: "tell me when it is back" from a sold-out product page (the page itself comes with S02).
import { adminDeps } from '@/lib/admin-auth';
import { publicBackInStockHandler } from '@/lib/catalogue-tools-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return publicBackInStockHandler(request, adminDeps());
}
