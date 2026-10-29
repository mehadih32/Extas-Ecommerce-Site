// S08 · PR 182 — the packing step: the steps and their orders, "Start picking" for all, one order at the packing table,
// checking its pieces, the packing photo and the owner's override, and "Mark packed". The paths are in
// lib/fulfil-api.ts. The photo is re-encoded with sharp, so this runs on Node.
import { adminDeps } from '@/lib/admin-auth';
import { packingRoute } from '@/lib/fulfil-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => packingRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
