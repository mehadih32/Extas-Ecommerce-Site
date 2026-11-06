// S13 · PR 280 — Marketing › Seasonal home: GET the page (`marketing.campaigns.read`); PUT the settings card and POST an
// action (a look saved, changed, set aside; a window scheduled or stopped; `marketing.campaigns.write`)
// (lib/marketing/seasonal-home.ts).
import { adminDeps } from '@/lib/admin-auth';
import { seasonalHomeHandler } from '@/lib/marketing/seasonal-home';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => seasonalHomeHandler(request, adminDeps());
export const POST = (request: Request) => seasonalHomeHandler(request, adminDeps());
export const PUT = (request: Request) => seasonalHomeHandler(request, adminDeps());
