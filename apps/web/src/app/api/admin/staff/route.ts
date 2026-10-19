// PR 15, 16 — the staff list; add a staff account.
import { adminDeps } from '@/lib/admin-auth';
import { staffHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return staffHandler(request, adminDeps());
}

export function POST(request: Request) {
  return staffHandler(request, adminDeps());
}
