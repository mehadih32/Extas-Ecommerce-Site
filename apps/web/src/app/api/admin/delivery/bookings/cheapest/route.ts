// S08 · PR 178 — "Book with the cheapest": each ticked order with its own cheapest courier, by the courier's own rate card
// for the parcel's band and weight. A person's press, only while `delivery.courier.selection` is on. Paths: lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { bookCheapestRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return bookCheapestRoute(request, adminDeps());
}
