// S29 · PR 753 — Reports › Geography map: the boundary shapes of one level (lib/geo-map/shapes.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapShapesHandler } from '@/lib/geo-map/shapes';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoMapShapesHandler(request, adminDeps());
