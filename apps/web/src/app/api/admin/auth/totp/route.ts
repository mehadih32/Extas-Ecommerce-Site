// PR 15 — set up, switch on or switch off your own two-step login.
import { adminDeps } from '@/lib/admin-auth';
import { totpHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return totpHandler(request, adminDeps());
}
