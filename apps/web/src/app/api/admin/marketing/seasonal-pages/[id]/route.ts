// S12 · PR 246 — one seasonal page: GET it (`marketing.landing.read`), PUT it (save, with its version) or POST
// {action, version} — publish, unpublish, archive, restore (`marketing.landing.write`; lib/marketing/seasonal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { seasonalHandler } from '@/lib/marketing/seasonal';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return seasonalHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return seasonalHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return seasonalHandler(request, adminDeps(), (await ctx.params).id);
}
