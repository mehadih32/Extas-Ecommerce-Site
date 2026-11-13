// S15 · PR 337 — one saved competitor's own report history, newest first.
import { adminDeps } from '@/lib/admin-auth';
import { competitorReportsHandler } from '@/lib/admin-ai/competitor-recheck-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return competitorReportsHandler(request, adminDeps(), (await ctx.params).id);
}
