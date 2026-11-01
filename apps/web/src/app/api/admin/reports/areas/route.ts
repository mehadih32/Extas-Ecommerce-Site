// S16 · PR 568 — Reports → Sales by area as a CSV file (`books.read`); the rules are in lib/area-sales.ts.
import { adminDeps } from '@/lib/admin-auth';
import { areasRoute } from '@/lib/area-sales';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => areasRoute(request, adminDeps());
export const POST = GET;
