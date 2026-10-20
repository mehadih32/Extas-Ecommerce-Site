// PR 201, 196 — one warehouse: rename, link to an ERP warehouse, archive (never deleted).
import { adminDeps } from '@/lib/admin-auth';
import { warehouseHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return warehouseHandler(request, adminDeps(), (await ctx.params).id);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return warehouseHandler(request, adminDeps(), (await ctx.params).id);
}
