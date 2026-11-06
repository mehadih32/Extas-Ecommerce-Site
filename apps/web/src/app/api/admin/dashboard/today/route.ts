// PR 631 (CN-036) — PUT the Lumen Today page's settings cards (`admin.today`; `settings.write`; lib/admin-look/today-api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { todayHandler } from '@/lib/admin-look/today-api';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return todayHandler(request, adminDeps());
}
