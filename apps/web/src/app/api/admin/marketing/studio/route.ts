// S23 · PR 437–439 — Marketing › Studio: GET the page (`studio.read`); POST an account/template/asset action
// (`studio.write`) or a render job action (`studio.generate`) (lib/marketing/studio.ts).
import { adminDeps } from '@/lib/admin-auth';
import { studioHandler } from '@/lib/marketing/studio';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => studioHandler(request, adminDeps());
export const POST = (request: Request) => studioHandler(request, adminDeps());
