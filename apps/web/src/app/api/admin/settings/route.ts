// Read-only admin list of the settings (PR 491/492): key, labels, effective value and its source.
// TODO(PR 15/16): require an admin session and the settings-read permission. Until then the staging password (Caddy,
// PR 7) is the only gate — which is why the list never carries owner data (PR 509) or anything from the vault (PR 493).
import { adminSettingsResponse, settingsResolver } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adminSettingsResponse(request.url, settingsResolver());
}
