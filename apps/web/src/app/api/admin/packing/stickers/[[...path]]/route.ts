// S08 · PR 179 — the courier stickers: the print run, printing them as one PDF, and a sample sticker. The paths are in
// lib/fulfil-api.ts. The PDF is drawn on the server (sharp's text engine), so this runs on Node.
import { adminDeps } from '@/lib/admin-auth';
import { stickersRoute } from '@/lib/fulfil-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => stickersRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
