// PR 31 — the fabric library with structured composition and care: list and add.
import { adminDeps } from '@/lib/admin-auth';
import { fabricsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return fabricsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return fabricsHandler(request, adminDeps());
}
