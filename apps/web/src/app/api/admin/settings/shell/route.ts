// PR 495 (12) follow-up 205 — Settings › More › Start & search: GET the start pages, search limits, Dashboard choices and
// the two switch cards (`settings.read`); PUT one card or switch (`settings.write`) (lib/admin-shell/shell-settings.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shellSettingsHandler } from '@/lib/admin-shell/shell-settings';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => shellSettingsHandler(request, adminDeps());
export const PUT = (request: Request) => shellSettingsHandler(request, adminDeps());
