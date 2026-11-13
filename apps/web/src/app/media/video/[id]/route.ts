// S28 · PR 681 — a product's own clip (lib/shop/video-serve).
import { mediaDeps } from '@/lib/media';
import { videoFileResponse } from '@/lib/shop/video-serve';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return videoFileResponse(request, mediaDeps(), (await ctx.params).id);
}
