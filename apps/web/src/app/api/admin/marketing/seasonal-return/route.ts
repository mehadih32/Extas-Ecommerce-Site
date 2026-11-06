// S12 · PR 530 — Marketing › Landing pages › Seasonal pages › Each year: GET the screen (`marketing.landing.read`); PUT
// the card `marketing.seasonalReturn`, a page's "comes back each year" tick or the occasions' dates
// (`marketing.landing.write`; lib/marketing/seasonal-return.ts).
import { adminDeps } from '@/lib/admin-auth';
import { seasonalReturnHandler } from '@/lib/marketing/seasonal-return';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return seasonalReturnHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return seasonalReturnHandler(request, adminDeps());
}
