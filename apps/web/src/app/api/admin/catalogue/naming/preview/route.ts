// PR 590 — the edit form's Google and feed preview; nothing is saved.
import { adminDeps } from '@/lib/admin-auth';
import { namingPreviewHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return namingPreviewHandler(request, adminDeps());
}
