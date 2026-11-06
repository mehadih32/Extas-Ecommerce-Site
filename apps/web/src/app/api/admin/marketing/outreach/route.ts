// S13 · PR 279 — Marketing › SEO outreach: GET the page (`marketing.campaigns.read`); PUT the settings card and POST an
// action (a site added, moved along the pipeline, set aside; `marketing.campaigns.write`) (lib/marketing/outreach.ts).
import { adminDeps } from '@/lib/admin-auth';
import { outreachHandler } from '@/lib/marketing/outreach';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => outreachHandler(request, adminDeps());
export const POST = (request: Request) => outreachHandler(request, adminDeps());
export const PUT = (request: Request) => outreachHandler(request, adminDeps());
