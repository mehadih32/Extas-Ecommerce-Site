// PR 35 — the "Ready to publish" queue.
import { adminDeps } from '@/lib/admin-auth';
import { publishQueueHandler } from '@/lib/catalogue-publish-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return publishQueueHandler(request, adminDeps());
}
