// PR 15 — ends this session.
import { adminDeps } from '@/lib/admin-auth';
import { logoutHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return logoutHandler(request, adminDeps());
}
