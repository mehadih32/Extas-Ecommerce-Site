// S28 · PR 711 — Couriers › Claims & payouts › More options (list sizes).
import { adminDeps } from '@/lib/admin-auth';
import { claimsPageHandler } from '@/lib/courier-claims-page-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return claimsPageHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return claimsPageHandler(request, adminDeps());
}
