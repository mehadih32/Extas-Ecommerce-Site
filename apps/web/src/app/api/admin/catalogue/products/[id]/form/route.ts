// PR 21 — the product edit form's "Save changes", applied in order through the catalogue services.
import { adminDeps } from '@/lib/admin-auth';
import { productFormHandler } from '@/lib/catalogue-publish-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return productFormHandler(request, adminDeps(), (await ctx.params).id);
}
