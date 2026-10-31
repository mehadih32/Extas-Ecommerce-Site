// S11 · PR 588 — Website › SEO › Bengali pages: the coverage (GET, `seo.read`), pages marked ready or not (POST) and
// what a not-ready Bengali page shows (PUT), both `seo.manage` (lib/seo/bengali-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { bengaliHandler } from '@/lib/seo/bengali-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return bengaliHandler(request, adminDeps());
}

export function POST(request: Request) {
  return bengaliHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return bengaliHandler(request, adminDeps());
}
