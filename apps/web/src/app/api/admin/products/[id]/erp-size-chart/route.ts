// S28 · PR 683 — the ERP's size chart for a product's style (lib/catalogue-erp-chart-api).
import { adminDeps } from '@/lib/admin-auth';
import { productErpChartHandler } from '@/lib/catalogue-erp-chart-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const run = async (request: Request, ctx: Ctx) => productErpChartHandler(request, adminDeps(), (await ctx.params).id);

export const GET = run;
export const POST = run;
