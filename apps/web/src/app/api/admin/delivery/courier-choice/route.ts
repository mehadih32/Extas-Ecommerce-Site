// S08 · PR 178 — every courier's cost for a few orders, the cheapest first (the shop's own cost; never the customer's
// delivery charge). Empty while `delivery.courier.selection` is off. Paths: lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { courierChoiceRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return courierChoiceRoute(request, adminDeps());
}
