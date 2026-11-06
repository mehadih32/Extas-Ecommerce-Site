// S02 · PR 597 — Website › Launch default: GET the saved looks and the restore log (`website.read`); POST one step — save,
// restore, undo, rename, set aside, bring back (`website.layout.write`) (lib/website/launch-default-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { launchDefaultHandler } from '@/lib/website/launch-default-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => launchDefaultHandler(request, adminDeps());
export const POST = (request: Request) => launchDefaultHandler(request, adminDeps());
