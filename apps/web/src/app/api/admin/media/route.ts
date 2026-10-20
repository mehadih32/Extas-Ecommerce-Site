// PR 22, 37 — the media library: search (GET) and upload (POST, multipart).
import { adminDeps } from '@/lib/admin-auth';
import { mediaDeps, mediaLibraryHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return mediaLibraryHandler(request, adminDeps(), mediaDeps());
}

export function POST(request: Request) {
  return mediaLibraryHandler(request, adminDeps(), mediaDeps());
}
