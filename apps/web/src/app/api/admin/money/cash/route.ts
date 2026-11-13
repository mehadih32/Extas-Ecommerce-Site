// S28 · PR 687 — Finance › Money in & out: the cashbook (GET) and record / reverse / add an account (POST).
import { adminDeps } from '@/lib/admin-auth';
import { cashHandler } from '@/lib/cash-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return cashHandler(request, adminDeps());
}

export function POST(request: Request) {
  return cashHandler(request, adminDeps());
}
