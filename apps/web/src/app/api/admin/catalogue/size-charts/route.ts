// PR 27, 28 — size charts: the list with the screen's options; add one.
import { adminDeps } from '@/lib/admin-auth';
import { sizeChartsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sizeChartsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return sizeChartsHandler(request, adminDeps());
}
