// S12 · PR 246 — Marketing › Landing pages › Seasonal pages: GET the list (`marketing.landing.read`); POST a new page;
// PUT the card `marketing.seasonal` (`marketing.landing.write`; lib/marketing/seasonal.ts).
import { adminDeps } from '@/lib/admin-auth';
import { seasonalHandler } from '@/lib/marketing/seasonal';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return seasonalHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return seasonalHandler(request, adminDeps(), null);
}

export function PUT(request: Request) {
  return seasonalHandler(request, adminDeps(), null);
}
