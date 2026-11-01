// S13 · PR 254 — Marketing › Landing pages: the list (GET, `marketing.landing.read`), a new page (POST) and the master
// switch's card (PUT), both `marketing.landing.write` (lib/marketing/landing.ts).
import { adminDeps } from '@/lib/admin-auth';
import { landingHandler } from '@/lib/marketing/landing';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return landingHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return landingHandler(request, adminDeps(), null);
}

export function PUT(request: Request) {
  return landingHandler(request, adminDeps(), null);
}
