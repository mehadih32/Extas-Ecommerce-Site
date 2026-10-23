// PR 12 — the sidebar badges: waiting work per section, only what the person may open (lib/admin-shell/api.ts).
import { badgesHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return badgesHandler(request);
}
