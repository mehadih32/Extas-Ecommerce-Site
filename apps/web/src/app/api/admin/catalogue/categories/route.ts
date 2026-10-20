// PR 20 — the category tree, and add a category.
import { adminDeps } from '@/lib/admin-auth';
import { categoriesHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return categoriesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return categoriesHandler(request, adminDeps());
}
