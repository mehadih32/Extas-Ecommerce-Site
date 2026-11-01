// S21 · PR 594 — Help & Build › Reported problems (GET `build.read`; POST a report or a status `build.report`);
// lib/build-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { buildProblemsHandler } from '@/lib/build-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return buildProblemsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return buildProblemsHandler(request, adminDeps());
}
