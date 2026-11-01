// S16 · PR 349 — Money → Profit & loss as a CSV file (`books.read`); the rules are in lib/profit-report.ts.
import { adminDeps } from '@/lib/admin-auth';
import { profitRoute } from '@/lib/profit-report';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => profitRoute(request, adminDeps());
export const POST = GET;
