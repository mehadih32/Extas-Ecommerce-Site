// S13 · PR 255 — Marketing › Landing pages › Templates: the list (GET, `marketing.landing.read`) and an own template
// saved from the builder (POST, `marketing.landing.write`) (lib/marketing/landing-templates.ts).
import { adminDeps } from '@/lib/admin-auth';
import { landingTemplatesHandler } from '@/lib/marketing/landing-templates';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return landingTemplatesHandler(request, adminDeps(), null);
}

export function POST(request: Request) {
  return landingTemplatesHandler(request, adminDeps(), null);
}
