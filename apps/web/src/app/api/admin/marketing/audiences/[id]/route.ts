// S13 · PR 262 — one audience: GET it (`marketing.audiences.read`), PUT it (save, with its version) or POST
// {action, version} — recount, archive, restore (`marketing.audiences.write`; lib/marketing/audiences.ts). Nothing is
// deleted and nothing is sent to an ad platform.
import { adminDeps } from '@/lib/admin-auth';
import { audiencesHandler } from '@/lib/marketing/audiences';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return audiencesHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return audiencesHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return audiencesHandler(request, adminDeps(), (await ctx.params).id);
}
