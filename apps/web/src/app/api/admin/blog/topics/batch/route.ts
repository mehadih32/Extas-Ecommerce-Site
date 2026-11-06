// S12 · PR 244 — the approval queue: POST {month} approves every proposed topic of that monthly batch at once, a very
// close one held for the owner's own decision (`blog.publish`; lib/journal/clusters.ts approveBatch).
import { adminDeps } from '@/lib/admin-auth';
import { planHandler } from '@/lib/journal/clusters';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return planHandler(request, adminDeps(), 'batch', null);
}
