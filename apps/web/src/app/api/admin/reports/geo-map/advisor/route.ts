// S29 · PR 761 — Reports › Geography map advisor (advice only) as JSON; the rules are in lib/geo-map/advisor-api.ts. Off as shipped.
import { adminDeps } from '@/lib/admin-auth';
import { geoAdvisorRoute } from '@/lib/geo-map/advisor-api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoAdvisorRoute(request, adminDeps());
export const POST = GET;
