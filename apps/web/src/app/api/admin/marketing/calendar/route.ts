// S13 · PR 282 — Marketing › Calendar: GET the view (?from=YYYY-MM-DD; `marketing.campaigns.read`); PUT the settings card
// and POST a plan-line action (`marketing.campaigns.write`) (lib/marketing/calendar.ts).
import { adminDeps } from '@/lib/admin-auth';
import { calendarHandler } from '@/lib/marketing/calendar';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => calendarHandler(request, adminDeps());
export const PUT = (request: Request) => calendarHandler(request, adminDeps());
export const POST = (request: Request) => calendarHandler(request, adminDeps());
