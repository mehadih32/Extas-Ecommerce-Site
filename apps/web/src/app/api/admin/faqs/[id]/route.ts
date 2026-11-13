// S28 · PR 682 — one FAQ (lib/catalogue-faq-api).
import { adminDeps } from '@/lib/admin-auth';
import { faqHandler } from '@/lib/catalogue-faq-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const run = async (request: Request, ctx: Ctx) => faqHandler(request, adminDeps(), (await ctx.params).id);

export const PATCH = run;
export const POST = run;
export const DELETE = run;
