// PR 31 — one fabric; change or archive it.
import { adminDeps } from '@/lib/admin-auth';
import { fabricHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return fabricHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return fabricHandler(request, adminDeps(), (await ctx.params).id);
}
