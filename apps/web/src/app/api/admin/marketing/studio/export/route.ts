// S25 · PR 487 — Marketing › Studio › Export: GET the overview (`marketing.studio.read`); POST {action: 'request'}
// or {action: 'cancel'} (`marketing.studio.write`) (lib/studio/export-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { exportsHandler } from '@/lib/studio/export-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => exportsHandler(request, adminDeps());
export const POST = (request: Request) => exportsHandler(request, adminDeps());
