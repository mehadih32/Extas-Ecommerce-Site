// PR 552 — the address autocomplete: places starting with what the customer typed (Bengali, English or Banglish), each
// with its district and its band's charge. Public and read-only; never a customer.
import { adminDeps } from '@/lib/admin-auth';
import { publicSuggestHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return publicSuggestHandler(request, adminDeps());
}
