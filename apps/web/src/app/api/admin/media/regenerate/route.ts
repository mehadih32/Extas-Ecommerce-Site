// PR 37 — remake every size of every photo from the archived originals (after a size or quality change).
import { adminDeps } from '@/lib/admin-auth';
import { mediaDeps, mediaRegenerateHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return mediaRegenerateHandler(request, adminDeps(), mediaDeps());
}
