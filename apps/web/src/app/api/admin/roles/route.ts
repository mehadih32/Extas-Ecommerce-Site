// PR 495 — the role builder: list and create roles.
import { adminDeps } from '@/lib/admin-auth';
import { rolesHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return rolesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return rolesHandler(request, adminDeps());
}
