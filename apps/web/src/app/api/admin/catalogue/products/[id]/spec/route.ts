// S28 · PR 1030 — the add-product wizard's own answers on a draft (lib/catalogue-wizard-spec-api).
import { adminDeps } from '@/lib/admin-auth';
import { productWizardSpecHandler } from '@/lib/catalogue-wizard-spec-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const run = async (request: Request, ctx: Ctx) => productWizardSpecHandler(request, adminDeps(), (await ctx.params).id);

export const GET = run;
export const POST = run;
