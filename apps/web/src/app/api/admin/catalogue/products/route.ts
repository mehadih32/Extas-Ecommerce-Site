// PR 19 — products: list and search, and add a draft.
import { adminDeps } from '@/lib/admin-auth';
import { productsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return productsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return productsHandler(request, adminDeps());
}
