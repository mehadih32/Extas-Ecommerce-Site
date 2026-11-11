// S25 · PR 482 — Marketing › Studio › Videos: GET the overview (`marketing.studio.read`); POST {action: 'estimate' |
// 'request'} (`marketing.studio.write`) (lib/studio/video-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { videosHandler } from '@/lib/studio/video-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => videosHandler(request, adminDeps());
export const POST = (request: Request) => videosHandler(request, adminDeps());
