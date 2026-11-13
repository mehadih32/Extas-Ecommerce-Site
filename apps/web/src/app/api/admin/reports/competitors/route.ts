// S15 · PR 337 — the saved competitor list: GET (`reports.read`), POST {action, ...} (`reports.competitors.write`).
import { adminDeps } from '@/lib/admin-auth';
import { competitorListHandler } from '@/lib/admin-ai/competitor-list-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return competitorListHandler(request, adminDeps());
}

export async function POST(request: Request) {
  return competitorListHandler(request, adminDeps());
}
