// S16 · PR 351 — the money report setting (Money → Profit & loss). The route is described in lib/money-report-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { moneyReportRoute } from '@/lib/money-report-api';

export const dynamic = 'force-dynamic';

export const PUT = (request: Request) => moneyReportRoute(request, adminDeps());
