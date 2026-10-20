// PR 590 — orders and sales before and after one rename.
import { adminDeps } from '@/lib/admin-auth';
import { renameReportHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return renameReportHandler(request, adminDeps(), (await ctx.params).id);
}
