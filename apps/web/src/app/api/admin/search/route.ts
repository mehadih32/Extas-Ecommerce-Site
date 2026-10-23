// PR 12 — SH-02, the command palette's search (lib/admin-shell/search.ts).
import { searchHandler } from '@/lib/admin-shell/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return searchHandler(request);
}
