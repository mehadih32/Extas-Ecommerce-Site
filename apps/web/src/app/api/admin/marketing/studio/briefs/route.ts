// S25 · PR 490 — Marketing › Studio › Creative brief: GET the overview (`marketing.studio.read`); POST {action:
// 'draft' | 'propose' | 'choose' | 'archive'} (`marketing.studio.write`) (lib/studio/brief-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { briefsHandler } from '@/lib/studio/brief-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => briefsHandler(request, adminDeps());
export const POST = (request: Request) => briefsHandler(request, adminDeps());
