// S12 · PR 528 — one blog brief: GET it (`blog.read`) or PUT it with its version (`blog.write`; never deleted).
// PR 243 — POST {action: 'draft', version}: the AI's first draft from it (`blog.write`; AI on for the shop and
// `blog.aiDraft` on) (lib/journal/briefs.ts).
import { adminDeps } from '@/lib/admin-auth';
import { briefHandler } from '@/lib/journal/briefs';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return briefHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return briefHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return briefHandler(request, adminDeps(), (await ctx.params).id);
}
