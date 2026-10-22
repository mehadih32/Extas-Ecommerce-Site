// PR 555 — phone-first recognition at checkout: a bare phone number prefills the AREA only (enough to set the charge).
// The house, road and full address need a login or a confirmed SMS code. Public, same-site, size-capped, a per-IP limit.
import { adminDeps } from '@/lib/admin-auth';
import { publicPhoneAreaHandler } from '@/lib/delivery-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return publicPhoneAreaHandler(request, adminDeps());
}
