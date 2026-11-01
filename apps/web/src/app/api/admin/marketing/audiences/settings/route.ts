// S13 · PR 263 — /api/admin/marketing/audiences/settings: the sending card `ads.audiences` (GET with
// `marketing.audiences.read`, PUT with `marketing.audiences.write`). See lib/marketing/audience-push.ts.
import { adminDeps } from '@/lib/admin-auth';
import { audiencesSettingsHandler } from '@/lib/marketing/audience-push';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return audiencesSettingsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return audiencesSettingsHandler(request, adminDeps());
}
