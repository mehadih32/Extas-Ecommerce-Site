// PR 620 — GET /erp-api/top-products?from&to&limit: the ERP asks, live, when the owner clicks "Top products" in the ERP.
// Signed by the asking store's own secret; no session, no cookie. Every check, setting and answer is in lib/erp-site-api.ts.
import { erpSiteRoute } from '@/lib/erp-site-api';

export const dynamic = 'force-dynamic';

// A call refused from the request alone is answered before anything is read; the rest inside one try (no-store always).
const handle = (request: Request): Promise<Response> => erpSiteRoute(request);

export const GET = handle;
// Any other method is answered (405, counted) by the handler, never by the framework.
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
