// PR 20 — garment types with their measurement fields: list and add.
import { adminDeps } from '@/lib/admin-auth';
import { garmentTypesHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return garmentTypesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return garmentTypesHandler(request, adminDeps());
}
