// S15 · PR 581 — Marketing › Ad platforms › Ads guardrails: GET the figures and the card
// (`marketing.campaigns.read`); PUT the card (`marketing.ads.approve`); POST {action: 'decreaseNow'}
// (`marketing.ads.control`). lib/marketing/ads-guardrails.ts `guardrailsHandler`.
import { adminDeps } from '@/lib/admin-auth';
import { guardrailsHandler } from '@/lib/marketing/ads-guardrails';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => guardrailsHandler(request, adminDeps());
export const POST = (request: Request) => guardrailsHandler(request, adminDeps());
export const PUT = (request: Request) => guardrailsHandler(request, adminDeps());
