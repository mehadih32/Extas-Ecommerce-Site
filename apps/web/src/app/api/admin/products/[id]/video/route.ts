// S28 · PR 681 — a product's video (lib/catalogue-video-api).
import { adminDeps } from '@/lib/admin-auth';
import { productVideoHandler } from '@/lib/catalogue-video-api';
import { mediaDeps } from '@/lib/media';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const run = async (request: Request, ctx: Ctx) => productVideoHandler(request, adminDeps(), mediaDeps(), (await ctx.params).id);

export const GET = run;
export const PUT = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
