// S13 · PR 569 — where to advertise: GET the page (`marketing.campaigns.read`, ?category=<id>); PUT the card
// `ads.geoGuide` (`marketing.campaigns.write`) (lib/marketing/geo-guide.ts). Advice only.
import { adminDeps } from '@/lib/admin-auth';
import { geoGuideHandler } from '@/lib/marketing/geo-guide';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return geoGuideHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return geoGuideHandler(request, adminDeps());
}
