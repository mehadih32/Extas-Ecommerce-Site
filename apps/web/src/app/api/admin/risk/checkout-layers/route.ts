// S04 · PR 558 — the Parameter for Checkout's admin route; the table is in lib/checkout-layers-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { checkoutLayersRoute } from '@/lib/checkout-layers-api';

export const dynamic = 'force-dynamic';

const run = (request: Request) => checkoutLayersRoute(request, adminDeps());

export const GET = run;
export const PUT = run;
