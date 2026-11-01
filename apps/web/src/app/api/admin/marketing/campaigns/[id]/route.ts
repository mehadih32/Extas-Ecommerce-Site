// S13 · PR 256 — one campaign: GET it (`marketing.campaigns.read`), PUT it (save, with its version) or POST
// {action, version} — schedule, start, pause, resume, end, archive, restore (`marketing.campaigns.write`;
// lib/marketing/campaigns.ts). Nothing is deleted and no ad platform's budget is changed.
import { adminDeps } from '@/lib/admin-auth';
import { campaignsHandler } from '@/lib/marketing/campaigns';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return campaignsHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return campaignsHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return campaignsHandler(request, adminDeps(), (await ctx.params).id);
}
