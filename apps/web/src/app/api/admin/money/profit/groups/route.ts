// S16 · PR 504 — Money → Profit by group as a CSV file (`books.read`); the rules are in lib/group-profit-view.ts.
import { adminDeps } from '@/lib/admin-auth';
import { groupProfitRoute } from '@/lib/group-profit-view';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => groupProfitRoute(request, adminDeps());
export const POST = GET;
