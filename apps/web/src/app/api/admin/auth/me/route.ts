// PR 15, 16 — who is signed in and what they may do.
import { adminDeps } from '@/lib/admin-auth';
import { meHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return meHandler(request, adminDeps());
}
