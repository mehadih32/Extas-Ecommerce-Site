// PR 859 (parity F5) — Money › Costs › "Pay salary": the month's salaries written into the cashbook (Accounts and the owner, with the PIN).
import { adminDeps } from '@/lib/admin-auth';
import { staffPayHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return staffPayHandler(request, adminDeps());
}
