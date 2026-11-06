// S12 · PR 239 — one category: PUT it (save, with its version) or POST {action: archive | restore, version}
// (`blog.write`; never deleted; lib/journal/journal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shelfHandler } from '@/lib/journal/journal';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return shelfHandler(request, adminDeps(), 'categories', (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return shelfHandler(request, adminDeps(), 'categories', (await ctx.params).id);
}
