// S18 · PR 386 — Settings › Sign-in & security › Cloudflare protection: the page's data (GET, `security.read`), the
// plan saved (PUT, `settings.write`) and sent to Cloudflare (POST, `security.write`), lib/admin-edge/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { edgeHandler } from '@/lib/admin-edge/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return edgeHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return edgeHandler(request, adminDeps());
}

export function POST(request: Request) {
  return edgeHandler(request, adminDeps());
}
