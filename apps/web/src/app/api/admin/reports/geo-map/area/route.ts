// S29 · PR 752 — Reports › Geography map: one area's panel (?area=<id>), the same rules as the JSON route (lib/geo-map/api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapAreaHandler } from '@/lib/geo-map/api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoMapAreaHandler(request, adminDeps());
