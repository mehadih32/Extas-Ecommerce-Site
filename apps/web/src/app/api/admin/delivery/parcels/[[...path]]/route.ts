// S08 · PR 175 — the parcels: the list by view, one parcel with its courier events, an exception recorded by staff.
// The paths are in lib/shipping-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { parcelsRoute } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => parcelsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
