// S13 · PR 259 — Marketing › Ad platforms: the overview (GET, `marketing.campaigns.read`), "Read now" and tying a
// platform campaign to one of ours (POST, `marketing.campaigns.write`) (lib/marketing/ad-platforms.ts). Read only on
// the platforms: nothing is paused and no budget changes.
import { adminDeps } from '@/lib/admin-auth';
import { adPlatformsHandler } from '@/lib/marketing/ad-platforms';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adPlatformsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return adPlatformsHandler(request, adminDeps());
}
