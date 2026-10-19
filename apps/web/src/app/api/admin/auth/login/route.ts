// PR 15 — staff login (e-mail + password); sets the session cookie or asks for the 2-step code.
import { adminDeps } from '@/lib/admin-auth';
import { loginHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return loginHandler(request, adminDeps());
}
