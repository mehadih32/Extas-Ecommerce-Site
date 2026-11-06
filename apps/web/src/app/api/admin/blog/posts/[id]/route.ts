// S12 · PR 239 — one article: GET it (`blog.read`), PUT it (save, with its version) or POST {action, version} — write,
// pass a review step, send back, schedule, publish, take down, put away, restore (lib/journal/journal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { journalHandler } from '@/lib/journal/journal';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return journalHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return journalHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return journalHandler(request, adminDeps(), (await ctx.params).id);
}
