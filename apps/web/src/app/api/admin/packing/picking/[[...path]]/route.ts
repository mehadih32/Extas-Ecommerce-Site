// S08 · PR 181 — the daily picking list: the list as data, and the list as a PDF. The paths are in lib/fulfil-api.ts.
// The PDF is drawn on the server (sharp's text engine), so this runs on Node.
import { adminDeps } from '@/lib/admin-auth';
import { pickingRoute } from '@/lib/fulfil-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => pickingRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
