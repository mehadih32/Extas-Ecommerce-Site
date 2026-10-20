// PR 203 — stock counts: the latest ones; start a count of one location.
import { adminDeps } from '@/lib/admin-auth';
import { auditsHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return auditsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return auditsHandler(request, adminDeps());
}
