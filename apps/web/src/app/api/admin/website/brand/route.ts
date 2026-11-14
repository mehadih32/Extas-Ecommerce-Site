// PR 726 — Website › Brand & menus: the page's data (GET) and one card saved (PUT), lib/admin-brand/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { brandHandler } from '@/lib/admin-brand/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return brandHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return brandHandler(request, adminDeps());
}
