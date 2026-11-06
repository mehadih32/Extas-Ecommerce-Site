// S13 · PR 589 — the Merchant Center feed: GET the page (`marketing.campaigns.read`); PUT the card `ads.merchantFeed`
// (`marketing.campaigns.write`) (lib/marketing/merchant-feed.ts).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps } from '@/lib/admin-auth';
import { feedHandler } from '@/lib/marketing/merchant-feed';
import { siteAddress } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  return feedHandler(request, adminDeps(), (await siteAddress(MOTHER_STORE_ID)).origin ?? null);
}

export function GET(request: Request) {
  return handle(request);
}

export function PUT(request: Request) {
  return handle(request);
}
