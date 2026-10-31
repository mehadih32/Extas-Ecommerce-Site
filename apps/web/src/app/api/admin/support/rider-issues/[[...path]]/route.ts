// S08 · PR 192 (CN-018 (7), SUP-02) — Support › Rider issues: the complaints, logging one with its proof photos,
// approving (the courier claim for the exact extra opens) or rejecting it, and asking the refund of the extra while the
// owner allows it (a request only; he approves it on the refunds list). Paths: lib/courier-report-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { riderIssuesRoute } from '@/lib/courier-report-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => riderIssuesRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
