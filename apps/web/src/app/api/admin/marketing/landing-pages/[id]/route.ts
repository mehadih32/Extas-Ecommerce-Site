// S13 · PR 254 — one landing page: GET it (`marketing.landing.read`), PUT it (save, with its version) or POST
// {action, version} — publish, unpublish, archive, restore (`marketing.landing.write`; lib/marketing/landing.ts).
import { adminDeps } from '@/lib/admin-auth';
import { landingHandler } from '@/lib/marketing/landing';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return landingHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return landingHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return landingHandler(request, adminDeps(), (await ctx.params).id);
}
