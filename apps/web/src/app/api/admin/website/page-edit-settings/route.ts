// S02 · PR 600 — Website › More › On-page edit: GET the switch and its options with the on-page publishes
// (`website.read`); PUT them (`website.layout.write`; audited website.pageEdit.settings) (lib/website/page-edit-settings.ts).
import { adminDeps } from '@/lib/admin-auth';
import { pageEditSettingsHandler } from '@/lib/website/page-edit-settings';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => pageEditSettingsHandler(request, adminDeps());
export const PUT = (request: Request) => pageEditSettingsHandler(request, adminDeps());
