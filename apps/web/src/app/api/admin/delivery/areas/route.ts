// PR 550 — the owner's sub-area list: see it; put a place on it.
import { adminDeps } from '@/lib/admin-auth';
import { areasHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return areasHandler(request, adminDeps());
}

export function POST(request: Request) {
  return areasHandler(request, adminDeps());
}
