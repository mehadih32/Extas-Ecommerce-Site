// PR 201 — add a location to a warehouse.
import { adminDeps } from '@/lib/admin-auth';
import { warehouseLocationsHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return warehouseLocationsHandler(request, adminDeps(), (await ctx.params).id);
}
