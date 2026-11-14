// S28 · PR 714-717 — Reports › Profit, Products, Marketing & ads and Monthly review as CSV files; the rules are in lib/reports-v5/export.ts.
import { adminDeps } from '@/lib/admin-auth';
import { exportRoute } from '@/lib/reports-v5/export';

export const dynamic = 'force-dynamic';

export const GET = async (request: Request, ctx: { params: Promise<{ kind: string }> }) => exportRoute((await ctx.params).kind, request, adminDeps());
