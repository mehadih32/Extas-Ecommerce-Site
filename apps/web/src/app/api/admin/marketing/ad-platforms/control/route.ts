// S13 · PR 268 — Marketing › Ad platforms' campaign controls: GET the switch's card and the requests
// (`marketing.campaigns.read`); POST a change after the confirm step (`marketing.ads.control`: a pause or a lower budget is
// sent, more spend waits for the owner) or the owner's decision (`marketing.ads.approve`); PUT the card
// (`marketing.ads.approve`) (lib/marketing/campaign-control.ts). Practice writers only for now.
import { adminDeps } from '@/lib/admin-auth';
import { campaignControlHandler } from '@/lib/marketing/campaign-control';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => campaignControlHandler(request, adminDeps());
export const POST = (request: Request) => campaignControlHandler(request, adminDeps());
export const PUT = (request: Request) => campaignControlHandler(request, adminDeps());
