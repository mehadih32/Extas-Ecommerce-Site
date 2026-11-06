// S02 · PR 83 — one A/B test: GET it with its result (`reports.experiments.read`); PUT a draft (with its version) or POST
// {action, version, winner?} — start, pause, end, keep, archive, restore (`reports.experiments.write`;
// lib/experiments/admin.ts). Nothing is deleted; no price, discount, COD or delivery charge is ever tested.
import { adminDeps } from '@/lib/admin-auth';
import { experimentsHandler } from '@/lib/experiments/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  return experimentsHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: Ctx) {
  return experimentsHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PUT(request: Request, ctx: Ctx) {
  return experimentsHandler(request, adminDeps(), (await ctx.params).id);
}
