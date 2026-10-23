// PR 12 — DSH-01 "Needs you now": each waiting list with its count, oldest age and link (lib/admin-shell/api.ts).
import { queuesHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return queuesHandler(request);
}
