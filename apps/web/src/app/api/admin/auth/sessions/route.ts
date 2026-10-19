// PR 15; B6.5 — the device list and "log out everywhere".
import { adminDeps } from '@/lib/admin-auth';
import { sessionsHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sessionsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return sessionsHandler(request, adminDeps());
}
