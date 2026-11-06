// S12 · PR 242 — the topical cluster planner's topics: the plan (GET, `blog.read`) and a new one (POST, `blog.write`)
// (lib/journal/clusters.ts).
import { adminDeps } from '@/lib/admin-auth';
import { planHandler } from '@/lib/journal/clusters';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return planHandler(request, adminDeps(), 'topics', null);
}

export function POST(request: Request) {
  return planHandler(request, adminDeps(), 'topics', null);
}
