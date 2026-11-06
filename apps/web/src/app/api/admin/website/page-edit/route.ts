// S02 · PR 600 — the on-page edit mode's bar on a shop page: GET its state, POST one step (section, set, discard,
// publish, undo). Signed-in owner with `website.layout.write` only, while `shop.pageEdit` is on
// (lib/website/page-edit-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { pageEditHandler } from '@/lib/website/page-edit-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => pageEditHandler(request, adminDeps());
export const POST = (request: Request) => pageEditHandler(request, adminDeps());
