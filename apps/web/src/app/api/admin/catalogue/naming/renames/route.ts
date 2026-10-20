// PR 590 — rename history (?productId=).
import { adminDeps } from '@/lib/admin-auth';
import { renamesHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return renamesHandler(request, adminDeps());
}
