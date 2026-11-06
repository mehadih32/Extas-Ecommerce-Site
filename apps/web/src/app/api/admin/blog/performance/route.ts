// S12 · PR 250 — the content performance report: GET each article's readers and the orders that read it (`blog.read`;
// money with `reports.read`); PUT the card `blog.performance` (`blog.publish`) (lib/journal/performance.ts).
import { adminDeps } from '@/lib/admin-auth';
import { performanceHandler } from '@/lib/journal/performance';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return performanceHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return performanceHandler(request, adminDeps());
}
