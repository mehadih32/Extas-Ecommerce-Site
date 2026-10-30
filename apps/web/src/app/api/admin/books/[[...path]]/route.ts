// CN-028 · PR 615, 616 — every Money → Books admin route (Retail's ERP account, "paid to ERP", the pipeline; the books
// match, differences and closes). The table of paths is in lib/books-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { booksRoute } from '@/lib/books-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => booksRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
