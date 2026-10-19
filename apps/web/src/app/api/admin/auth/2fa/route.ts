// PR 15 — the second step of a two-step login.
import { adminDeps } from '@/lib/admin-auth';
import { twoFactorHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return twoFactorHandler(request, adminDeps());
}
