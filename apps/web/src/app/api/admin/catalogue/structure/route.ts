// PR 746 — Products › Categories & tags: the page's cards (GET) and one card saved (PUT), lib/admin-structure/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { structureHandler } from '@/lib/admin-structure/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return structureHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return structureHandler(request, adminDeps());
}
