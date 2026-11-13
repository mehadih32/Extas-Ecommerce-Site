// S13 · PR 548 — Market & competitors: GET the screen (`marketing.campaigns.read`); PUT the card `ads.intel`; POST
// {url} to follow a link, {id, action} to check/archive/restore one (all `marketing.campaigns.write`)
// (lib/marketing/intel.ts). Proposals only — no price is ever written here.
import { adminDeps } from '@/lib/admin-auth';
import { intelHandler } from '@/lib/marketing/intel';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return intelHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return intelHandler(request, adminDeps());
}

export function POST(request: Request) {
  return intelHandler(request, adminDeps());
}
