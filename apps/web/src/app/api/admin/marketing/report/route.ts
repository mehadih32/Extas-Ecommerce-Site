// S13 · PR 283 — Marketing › Report: GET the report (?period= or ?from=&to=; `marketing.campaigns.read`); PUT the
// settings card (`marketing.campaigns.write`) (lib/marketing/report.ts).
import { adminDeps } from '@/lib/admin-auth';
import { reportHandler } from '@/lib/marketing/report';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => reportHandler(request, adminDeps());
export const PUT = (request: Request) => reportHandler(request, adminDeps());
