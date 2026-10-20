// PR 201 — change or archive a location; the last damaged bin of a warehouse stays.
import { adminDeps } from '@/lib/admin-auth';
import { locationHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return locationHandler(request, adminDeps(), (await ctx.params).id);
}
