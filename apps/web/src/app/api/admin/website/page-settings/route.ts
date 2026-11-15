// PR 740–744 — Website › Page settings: GET one screen's settings with their shapes (the screen's read key); PUT them
// (its write key) (lib/admin-pagesettings/service.ts).
import { adminDeps } from '@/lib/admin-auth';
import { pageSettingsHandler } from '@/lib/admin-pagesettings/service';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => pageSettingsHandler(request, adminDeps());
export const PUT = (request: Request) => pageSettingsHandler(request, adminDeps());
