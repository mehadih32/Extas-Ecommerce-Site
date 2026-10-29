// S20 · PR 407 — the invoices: the list, printing them (PDF on paper or the roll, a JPG picture) and the page's
// settings cards. The paths are in lib/invoices-api.ts. The files are drawn on the server (sharp's text engine), so this
// runs on Node.
import { adminDeps } from '@/lib/admin-auth';
import { invoicesRoute } from '@/lib/invoices-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => invoicesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
export const PUT = run;
