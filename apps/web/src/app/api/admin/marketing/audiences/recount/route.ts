// PR 1125 — Marketing › Audiences "Update now": count every live audience again now (`marketing.audiences.write`).
import { adminDeps } from '@/lib/admin-auth';
import { recountAllHandler } from '@/lib/marketing/audiences';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return recountAllHandler(request, adminDeps());
}
