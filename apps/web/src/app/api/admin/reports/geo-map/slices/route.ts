// S29 · PR 756 — Reports › Geography map: "Orders by …" (?by=channel|paymentType|courier|customerType), the same rules as the JSON route (lib/geo-map/api.ts).
import { adminDeps } from '@/lib/admin-auth';
import { geoMapSlicesHandler } from '@/lib/geo-map/api';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => geoMapSlicesHandler(request, adminDeps());
