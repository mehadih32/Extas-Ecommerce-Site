// S28 · PR 712 — Products › Sets › More options (which combos are sets, low stock).
import { adminDeps } from '@/lib/admin-auth';
import { setsOptionsHandler } from '@/lib/combos-sets-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return setsOptionsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return setsOptionsHandler(request, adminDeps());
}
