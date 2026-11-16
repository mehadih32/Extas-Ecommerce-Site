// D10 · PR 1004–1006 — Settings › Backups schedule, Site health alerts and checks, Updates (automatic), lib/admin-system/settings-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { systemSettingsRoute } from '@/lib/admin-system/settings-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return systemSettingsRoute(request, adminDeps());
}
