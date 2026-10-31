// S18 · PR 382 — SET-08d Privacy & data: the page's data (GET, `security.read`), the card saved (PUT, `security.write`),
// erasure requests filed, cancelled or carried out (POST; `customers.privacy`, carrying out the owner alone),
// lib/admin-privacy/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { privacyHandler } from '@/lib/admin-privacy/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return privacyHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return privacyHandler(request, adminDeps());
}

export function POST(request: Request) {
  return privacyHandler(request, adminDeps());
}
