// S12 · PR 242 — one of the planner's topics: PUT it (save, with its version) or POST {action, version}
// (`blog.write`; approving or rejecting a topic `blog.publish`; never deleted; lib/journal/clusters.ts).
import { adminDeps } from '@/lib/admin-auth';
import { planHandler } from '@/lib/journal/clusters';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return planHandler(request, adminDeps(), 'topics', (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return planHandler(request, adminDeps(), 'topics', (await ctx.params).id);
}
