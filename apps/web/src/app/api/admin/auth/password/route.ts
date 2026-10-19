// PR 15 — change your own password (every other session ends).
import { adminDeps } from '@/lib/admin-auth';
import { passwordHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return passwordHandler(request, adminDeps());
}
