// S25 · PR 485 — Marketing › Studio › Reels: GET the overview (`marketing.studio.read`); POST {action: 'build'} or
// {action: 'archive' | 'restore'} (`marketing.studio.write`) (lib/studio/reel-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { reelsHandler } from '@/lib/studio/reel-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => reelsHandler(request, adminDeps());
export const POST = (request: Request) => reelsHandler(request, adminDeps());
