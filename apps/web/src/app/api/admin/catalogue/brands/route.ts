// PR 590 — brands (a real brand field on every product): list and add.
import { adminDeps } from '@/lib/admin-auth';
import { brandsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return brandsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return brandsHandler(request, adminDeps());
}
