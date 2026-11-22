// S29 · PR 757 — GET /api/admin/reports/geo-map/lens?storeId=&from=&to=&level=&parent=
// The courier and coverage lens of Reports > Geography map: needs `reports.read` for the store, answers only when the
// courier lens is not switched off in the map's settings, and only reads (it changes no courier rule, booking or mapping).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { GEO_LEVELS, courierLens, ymdIn, type GeoLevel } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, type AdminDeps } from '@/lib/admin-auth';
import { parseReportQuery } from '@/lib/cost-report';

/** Reads a setting the registry may not have yet (the map's own key arrives with the main screen's PR). */

export async function lensRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const level = (url.searchParams.get('level') ?? 'district') as GeoLevel;
  if (!(GEO_LEVELS as readonly string[]).includes(level)) return fail(400, 'invalid-level');
  const parent = url.searchParams.get('parent');
  if (parent !== null && !/^[0-9a-f-]{8,40}$/i.test(parent)) return fail(400, 'invalid-parent');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const at = { storeId };
    const [timeZone, limits, thresholds] = await Promise.all([
      d.resolver.value("store.timeZone", at),
      d.resolver.value("costs.report", at),
      d.resolver.value("reports.geoMapCourier", at),
    ]);
    const period = parseReportQuery(
      Object.fromEntries(url.searchParams),
      ymdIn(new Date(), timeZone),
      limits,
    );
    const r = await courierLens(d.db, {
      storeId,
      timeZone,
      days: { from: period.q.from, to: period.q.to },
      level,
      parentAreaId: parent,
      thresholds,
    });
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
