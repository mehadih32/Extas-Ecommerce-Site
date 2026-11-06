// S02 · PR 597 follow-up (695) — one page's own snapshots (Website › Page layouts, Website › Side canvas): GET ?place= the
// list (`website.read`); POST save or restore (`website.layout.write`) (lib/website/page-snapshots.ts).
import { adminDeps } from '@/lib/admin-auth';
import { pageSnapsHandler } from '@/lib/website/page-snapshots';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => pageSnapsHandler(request, adminDeps());
export const POST = (request: Request) => pageSnapsHandler(request, adminDeps());
