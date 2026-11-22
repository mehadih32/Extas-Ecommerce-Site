// S29 · PR 752 — Reports › Geography map as a CSV file (the same rules as the JSON route; lib/geo-map/api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapCsvHandler } from '@/lib/geo-map/api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoMapCsvHandler(request, adminDeps());
