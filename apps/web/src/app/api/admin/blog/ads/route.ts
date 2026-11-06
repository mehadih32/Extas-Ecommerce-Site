// S12 · PR 592 — house ads: GET the page (`blog.read`, ?days=7|30|90); POST {op: 'ad' | 'place' | 'switch', …} and PUT
// the card `blog.houseAds` (`blog.publish`) (lib/journal/house-ads.ts).
import { adminDeps } from '@/lib/admin-auth';
import { adsHandler } from '@/lib/journal/house-ads';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return adsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return adsHandler(request, adminDeps());
}
