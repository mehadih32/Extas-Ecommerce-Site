// S08 · PR 180 — the rider's handover: the handover lists per courier, the handover sheet as a PDF, and marking a batch
// handed over. The paths are in lib/fulfil-api.ts. The PDF is drawn on the server (sharp's text engine), so this runs
// on Node.
import { adminDeps } from '@/lib/admin-auth';
import { handoverRoute } from '@/lib/fulfil-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => handoverRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
