// S14 · PR 295 — Products › Reviews › More options: the review request card (lib/review-settings-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { reviewSettingsHandler } from '@/lib/review-settings-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return reviewSettingsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return reviewSettingsHandler(request, adminDeps());
}
