// PR 12 — SH-03, the person's own notifications (none yet; lib/admin-shell/api.ts).
import { notificationsHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return notificationsHandler(request);
}
