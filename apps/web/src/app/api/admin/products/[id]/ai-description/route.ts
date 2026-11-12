// S15 · PR 326 — the product edit form's "Write with AI" button, for the English description field.
import { adminDeps } from '@/lib/admin-auth';
import { productAiDescriptionHandler } from '@/lib/admin-ai/product-content-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productAiDescriptionHandler(request, adminDeps(), (await ctx.params).id);
}
