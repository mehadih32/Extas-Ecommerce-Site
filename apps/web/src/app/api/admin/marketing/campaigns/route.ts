// S13 · PR 256 — Marketing › Campaigns: the list (GET, `marketing.campaigns.read`) and a new campaign (POST,
// `marketing.campaigns.write`) (lib/marketing/campaigns.ts). The budget is a plan; no ad platform is called.
import { adminDeps } from '@/lib/admin-auth';
import { campaignsHandler } from '@/lib/marketing/campaigns';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return campaignsHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return campaignsHandler(request, adminDeps(), null);
}
