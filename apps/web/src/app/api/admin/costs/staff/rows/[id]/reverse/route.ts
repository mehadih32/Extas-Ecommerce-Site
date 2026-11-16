// PR 1040 (final round D14) — cancel a bonus or a deduction with a new row that points at it (a reason and the owner's PIN).
import { adminDeps } from '@/lib/admin-auth';
import { staffRowReverseHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return staffRowReverseHandler(request, adminDeps(), (await ctx.params).id);
}
