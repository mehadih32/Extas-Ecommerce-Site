// PR 550 — the admin's place search (prefix only), each place with the band it sits in now.
import { adminDeps } from '@/lib/admin-auth';
import { placesHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return placesHandler(request, adminDeps());
}
