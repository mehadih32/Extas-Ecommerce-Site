// PR 30 — the colour library: list (?includeArchived=1) and add.
import { adminDeps } from '@/lib/admin-auth';
import { coloursHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return coloursHandler(request, adminDeps());
}

export function POST(request: Request) {
  return coloursHandler(request, adminDeps());
}
