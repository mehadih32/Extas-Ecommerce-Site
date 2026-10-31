// S08 · PR 192 (SIM-F-017) — courier claims: the list with its totals and the parcels still to claim, raising a claim
// for a lost or damaged parcel, and following it (sent, settled, rejected). Records only. Paths: lib/courier-report-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { claimsRoute } from '@/lib/courier-report-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path?: string[] }> };

const run = async (request: Request, ctx: Ctx) => claimsRoute(request, adminDeps(), (await ctx.params).path ?? []);

export const GET = run;
export const POST = run;
