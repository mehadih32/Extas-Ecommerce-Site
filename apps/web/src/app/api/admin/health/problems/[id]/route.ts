// S21 · PR 423 (CN-015) — one customer problem (GET, `health.read`) and its status with a note (POST,
// `health.problems.manage`; the owner's steps `health.problems.approve`), lib/admin-problems/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { problemHandler } from '@/lib/admin-problems/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return problemHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return problemHandler(request, adminDeps(), (await ctx.params).id);
}
