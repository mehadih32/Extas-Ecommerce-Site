// S08 · PR 176 — booking a courier: the orders ready to book, and a person's press of "Book" or "Book all" (never
// automatic; never a cancelled, held or in-review order). The paths are in lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { bookingsRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return bookingsRoute(request, adminDeps());
}

export function POST(request: Request) {
  return bookingsRoute(request, adminDeps());
}
