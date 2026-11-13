// S28 · PR 690 — Reports › Report packs: the schedules (GET) and save one (POST).
import { adminDeps } from '@/lib/admin-auth';
import { packsHandler } from '@/lib/report-packs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return packsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return packsHandler(request, adminDeps());
}
