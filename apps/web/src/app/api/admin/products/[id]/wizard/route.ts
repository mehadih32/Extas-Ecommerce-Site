// S28 · PR 685 — the add-product wizard's place on a draft (lib/catalogue-wizard-api).
import { adminDeps } from '@/lib/admin-auth';
import { productWizardHandler } from '@/lib/catalogue-wizard-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const run = async (request: Request, ctx: Ctx) => productWizardHandler(request, adminDeps(), (await ctx.params).id);

export const GET = run;
export const POST = run;
