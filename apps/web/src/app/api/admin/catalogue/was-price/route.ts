// PR 38 — the "was" price source per category; set one (needs catalogue.prices).
import { adminDeps } from '@/lib/admin-auth';
import { wasPriceHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return wasPriceHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return wasPriceHandler(request, adminDeps());
}
