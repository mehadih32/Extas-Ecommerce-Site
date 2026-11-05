// S13 · PR 265 — Marketing › Ad platforms' spend import: the daily import card (GET, `marketing.campaigns.read`; PUT,
// `marketing.campaigns.write`) and "Import now" (POST, `marketing.campaigns.write`) (lib/marketing/ad-spend.ts). Read only
// on the platforms: nothing is paused and no budget changes.
import { adminDeps } from '@/lib/admin-auth';
import { adSpendHandler } from '@/lib/marketing/ad-spend';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => adSpendHandler(request, adminDeps());
export const POST = (request: Request) => adSpendHandler(request, adminDeps());
export const PUT = (request: Request) => adSpendHandler(request, adminDeps());
