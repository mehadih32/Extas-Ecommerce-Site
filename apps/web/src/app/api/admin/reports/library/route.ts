// S28 · PR 689 — Reports › Report library: the cards for a period (GET) and pin, save a view, archive a view (POST).
import { adminDeps } from '@/lib/admin-auth';
import { libraryHandler } from '@/lib/report-library-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return libraryHandler(request, adminDeps());
}

export function POST(request: Request) {
  return libraryHandler(request, adminDeps());
}
