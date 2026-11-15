// PR 815 — /api/admin/privacy/board: POST {action: 'keep', media, chat} · {action: 'exportCustomers', pin}. lib/admin-privacy/board.ts.
import { adminDeps } from '@/lib/admin-auth';
import { privacyBoardRoute } from '@/lib/admin-privacy/board';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return privacyBoardRoute(request, adminDeps());
}
