// S21 · PR 594 — Help & Build › Blueprint & files: one docs file (or a kept version of it) as a download (`build.read`);
// lib/build-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { buildFilesHandler } from '@/lib/build-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return buildFilesHandler(request, adminDeps());
}
