// S02 · PR 81 — Website › Eye-toggles: GET every show/hide switch of the shop's pages (`website.read`); PUT some shown or
// hidden (`website.eye.write`) (lib/website/eye-admin.ts).
import { adminDeps } from '@/lib/admin-auth';
import { eyeTogglesHandler } from '@/lib/website/eye-admin';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => eyeTogglesHandler(request, adminDeps());
export const PUT = (request: Request) => eyeTogglesHandler(request, adminDeps());
