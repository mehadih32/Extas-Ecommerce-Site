// S12 · PR 242 — the topical cluster planner's clusters: the plan (GET, `blog.read`), a new cluster (POST, `blog.write`)
// and the planner's card (PUT, `blog.publish`) (lib/journal/clusters.ts).
import { adminDeps } from '@/lib/admin-auth';
import { planHandler } from '@/lib/journal/clusters';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return planHandler(request, adminDeps(), 'clusters', null);
}

export function POST(request: Request) {
  return planHandler(request, adminDeps(), 'clusters', null);
}

export function PUT(request: Request) {
  return planHandler(request, adminDeps(), 'clusters', null);
}
