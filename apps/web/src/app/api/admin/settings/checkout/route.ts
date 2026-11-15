// PR 748 — Settings › Checkout: the page's cards (GET) and one card saved (PUT), lib/admin-checkout/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { checkoutHandler } from '@/lib/admin-checkout/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return checkoutHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return checkoutHandler(request, adminDeps());
}
