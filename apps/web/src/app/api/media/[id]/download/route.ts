// PR 23 — the download / save copy of a product photo, watermarked. The shop's own images are never watermarked.
import { mediaDeps, mediaDownloadHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return mediaDownloadHandler(request, mediaDeps(), (await ctx.params).id);
}
