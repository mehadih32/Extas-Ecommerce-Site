// PR 203 — one stock count: read it; scan, review, complete or cancel ({action}).
import { adminDeps } from '@/lib/admin-auth';
import { auditHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return auditHandler(request, adminDeps(), (await ctx.params).id);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return auditHandler(request, adminDeps(), (await ctx.params).id);
}
