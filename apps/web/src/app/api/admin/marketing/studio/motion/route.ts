// S25 · PR 481 — Marketing › Studio › Motion library: GET the library (`marketing.studio.read`); POST
// {action: 'create' | 'update' | 'archive' | 'restore'} (`marketing.studio.write`) (lib/studio/motion-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { motionHandler } from '@/lib/studio/motion-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => motionHandler(request, adminDeps());
export const POST = (request: Request) => motionHandler(request, adminDeps());
