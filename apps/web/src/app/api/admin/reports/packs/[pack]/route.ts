// S28 · PR 690 — one report pack as a PDF on the letterhead or as a spreadsheet file (`?format=csv`).
import { adminDeps } from '@/lib/admin-auth';
import { packsHandler } from '@/lib/report-packs-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ pack: string }> }) {
  return packsHandler(request, adminDeps(), (await ctx.params).pack);
}
