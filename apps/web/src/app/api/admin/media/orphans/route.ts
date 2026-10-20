// PR 37 — files used nowhere (GET) and the clean-up that archives them, logged and restorable (POST).
import { adminDeps } from '@/lib/admin-auth';
import { mediaDeps, mediaOrphansHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return mediaOrphansHandler(request, adminDeps(), mediaDeps());
}

export function POST(request: Request) {
  return mediaOrphansHandler(request, adminDeps(), mediaDeps());
}
