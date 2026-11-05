// S13 · PR 267 — Marketing › Ad platforms' cost per order and alert rules: GET the figures, the card and the rules
// (`marketing.campaigns.read`); POST a rule added (off), switched, its limit changed or put away, and PUT the alert card
// (`marketing.campaigns.write`) (lib/marketing/ad-alerts.ts). An alert never pauses a campaign or changes a budget.
import { adminDeps } from '@/lib/admin-auth';
import { adAlertsHandler } from '@/lib/marketing/ad-alerts';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => adAlertsHandler(request, adminDeps());
export const POST = (request: Request) => adAlertsHandler(request, adminDeps());
export const PUT = (request: Request) => adAlertsHandler(request, adminDeps());
