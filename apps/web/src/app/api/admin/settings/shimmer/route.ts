// S02 · PR 598 — Settings › Shimmer: GET every shimmer's switch, speed and strength (`settings.read`); PUT them
// (`settings.write`) (lib/website/shimmer-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shimmerHandler } from '@/lib/website/shimmer-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => shimmerHandler(request, adminDeps());
export const PUT = (request: Request) => shimmerHandler(request, adminDeps());
