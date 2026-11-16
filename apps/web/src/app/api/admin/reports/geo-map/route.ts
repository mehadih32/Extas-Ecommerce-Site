// S29 · PR 752 — Reports › Geography map: the figures as JSON (`reports.read`; Sales only with `books.read`); 404 "not_on"
// while the setting `reports.geoMap` is off (lib/geo-map/api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapHandler } from '@/lib/geo-map/api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoMapHandler(request, adminDeps());
