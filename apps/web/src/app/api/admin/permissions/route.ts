// PR 495 — the permission catalogue for the role builder.
import { adminDeps } from '@/lib/admin-auth';
import { permissionsHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return permissionsHandler(request, adminDeps());
}
