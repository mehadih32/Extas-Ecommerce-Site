// S13 · PR 270 — Marketing › Ad platforms › Creative briefs: GET the page (`marketing.campaigns.read`); POST {action:
// 'create' | 'edit' | 'send' | 'setAside'} (`marketing.campaigns.write`); PUT the brief settings (`marketing.ads.control`)
// (lib/marketing/creative-brief.ts). A brief is words for the studio; it changes no price, budget or campaign.
import { adminDeps } from '@/lib/admin-auth';
import { creativeBriefHandler } from '@/lib/marketing/creative-brief';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => creativeBriefHandler(request, adminDeps());
export const POST = (request: Request) => creativeBriefHandler(request, adminDeps());
export const PUT = (request: Request) => creativeBriefHandler(request, adminDeps());
