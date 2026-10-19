// Read-only admin list of the settings (PR 491/492): key, labels, effective value and its source.
// PR 15/16: needs a signed-in staff member holding `settings.read` in the store asked for (settingsHandler). The list
// still never carries owner data (PR 509) or anything from the vault (PR 493).
import { adminDeps } from '@/lib/admin-auth';
import { settingsHandler } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return settingsHandler(request, adminDeps());
}
