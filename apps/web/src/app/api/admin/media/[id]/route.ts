// PR 37 — one file of the library: its sizes and uses (GET); alt texts, folder, tags, archive / restore (PATCH).
import { adminDeps } from '@/lib/admin-auth';
import { mediaDeps, mediaItemHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return mediaItemHandler(request, adminDeps(), mediaDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return mediaItemHandler(request, adminDeps(), mediaDeps(), (await ctx.params).id);
}
