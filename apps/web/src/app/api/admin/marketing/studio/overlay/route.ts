// S25 · PR 489 — Marketing › Studio › Campaign overlays: GET the list (`marketing.studio.read`); POST
// {action: 'create' | 'update' | 'enable' | 'disable' | 'archive' | 'restore'} (`marketing.studio.write`)
// (lib/studio/overlay-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { overlayHandler } from '@/lib/studio/overlay-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => overlayHandler(request, adminDeps());
export const POST = (request: Request) => overlayHandler(request, adminDeps());
