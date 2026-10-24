// PR 606 — the team's bulk / corporate enquiries: the list (orders.read) and the stage of one (orders.notes).
import { adminDeps } from '@/lib/admin-auth';
import { bulkAdminHandler } from '@/lib/bulk-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  return bulkAdminHandler(request, adminDeps(), (await params).path ?? []);
}

export async function POST(request: Request, { params }: Params) {
  return bulkAdminHandler(request, adminDeps(), (await params).path ?? []);
}
