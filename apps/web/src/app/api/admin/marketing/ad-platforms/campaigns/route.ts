// S13 · PR 531 — Marketing › Ad platforms › New campaigns: GET the page (`marketing.campaigns.read`); POST a draft, a
// duplicate, set aside / bring back, or a launch request that always waits for the owner (`marketing.ads.control`); PUT
// the switch (`marketing.ads.approve`) (lib/marketing/campaign-builder.ts). Practice writers only for now.
import { adminDeps } from '@/lib/admin-auth';
import { campaignBuilderHandler } from '@/lib/marketing/campaign-builder';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => campaignBuilderHandler(request, adminDeps());
export const POST = (request: Request) => campaignBuilderHandler(request, adminDeps());
export const PUT = (request: Request) => campaignBuilderHandler(request, adminDeps());
