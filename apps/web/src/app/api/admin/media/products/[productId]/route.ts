// PR 25 — a product's photos and its photo minimum (GET); place a library photo on it or take one off (POST).
import { adminDeps } from '@/lib/admin-auth';
import { mediaDeps, productPhotosHandler } from '@/lib/media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ productId: string }> }) {
  return productPhotosHandler(request, adminDeps(), mediaDeps(), (await ctx.params).productId);
}

export async function POST(request: Request, ctx: { params: Promise<{ productId: string }> }) {
  return productPhotosHandler(request, adminDeps(), mediaDeps(), (await ctx.params).productId);
}
