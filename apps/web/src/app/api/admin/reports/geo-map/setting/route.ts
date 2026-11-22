// S29 · PR 752 — Reports › Geography map: the card `reports.geoMap`. GET needs `reports.read`; PUT needs `settings.write`
// (audited). It works while the map is off: it is how the map is switched on (lib/geo-map/api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapSettingHandler } from '@/lib/geo-map/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return geoMapSettingHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return geoMapSettingHandler(request, adminDeps());
}
