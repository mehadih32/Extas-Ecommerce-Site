// PR 24 — rendition files from the storage adapter (local disk, Blob or S3) when no CDN address is set, or when the
// CDN asks this origin. Names carry a content hash, so they are cached for a long time. Originals are never served.
import { mediaDeps, mediaFileHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ key: string[] }> }) {
  return mediaFileHandler(request, mediaDeps(), (await ctx.params).key);
}
