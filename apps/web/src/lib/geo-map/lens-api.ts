// S29 · PR 758–760 (CN-054) — the lenses of Reports › Geography map on the database:
//   GET /api/admin/reports/geo-map/lens?lens=risk|money|demand&from=&to=&period=&level=&parent=&storeId=
// The answer is `{ ok, lens, level, days, rows, unknown, outside, total, extras, hidden }` (the figures of
// @extas/metrics `geoRisk`, `geoMoney` and `geoDemand`: counts and money only, never a customer's name or phone).
// Every rule is checked here on the server, not only on the screen:
//   - the page switch `reports.geoMap.on` and the lens's own switch `reports.geoMap.lenses.<lens>` (both off as shipped):
//     while either is off the route answers `not_on` and reads nothing;
//   - `reports.read` for the page; each part of a lens also needs the permission of its own source report (risk:
//     refusals `delivery.read`, risk areas `risk.report`, claims `delivery.claims`, tickets `support.read`; money: the
//     delivery and ad figures `books.read` (ads also `marketing.campaigns.read`), the stock part `reports.read`).
//     A part the viewer may not see is left out (`null`, named in `hidden`) — it is never read from the database;
//   - the period follows the report rules of Costs and Profit & loss (`costs.report`: never past today, at most
//     `maxDays`), the level is one of division, district, upazila, area, and `parent` (a place id) is the drill-down.
// Read-only: nothing here changes a setting, an order, a courier, a COD rule, a price, a charge or an ad.
import { can, type Actor } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { GEO_LEVELS, geoRisk, RISK_PARTS, ymdIn, type GeoLevel, type LensResult, type RiskPart } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { parseReportQuery } from '../cost-report';
import { readLensSetting, type LensKey } from './setting';

/** The lenses this route serves (the courier lens is served by its own lane). */
export const SERVED_LENSES = ['risk'] as const satisfies readonly LensKey[];
export type ServedLens = (typeof SERVED_LENSES)[number];

/** The permission of each part of the risk lens (the returns and cancels parts need only the page's own `reports.read`). */
export const RISK_PART_PERMISSION: Record<RiskPart, 'reports.read' | 'delivery.read' | 'risk.report' | 'delivery.claims' | 'support.read'> = {
  returns: 'reports.read',
  refusals: 'delivery.read',
  cancels: 'reports.read',
  risk: 'risk.report',
  claims: 'delivery.claims',
  tickets: 'support.read',
};

export type LensApiResponse =
  | ({ ok: true; lens: ServedLens } & LensResult)
  | { ok: false; error: 'not_on' | 'forbidden' | 'bad_query'; message: string };

const one = (v: string | null) => (v === null || v === '' ? null : v);

/** The key of the risk score's top band (the last of `risk.bands`), null when the owner has none. */
export async function topRiskBand(resolver: AdminDeps['resolver'], storeId: number): Promise<string | null> {
  const bands = await resolver.value('risk.bands', { storeId });
  return bands.length ? bands[bands.length - 1]!.key : null;
}

/** The risk parts the viewer may see. */
export async function riskParts(db: PrismaClient, actor: Actor, storeId: number): Promise<Set<RiskPart>> {
  const out = new Set<RiskPart>();
  for (const p of RISK_PARTS) if (await can(db, actor, RISK_PART_PERMISSION[p], { storeId })) out.add(p);
  return out;
}

/** The lens route. */
export async function geoLensRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  const refuse = (status: number, error: 'not_on' | 'forbidden' | 'bad_query', message: string) => json({ ok: false, error, message } satisfies LensApiResponse, { status });
  try {
    const lens = SERVED_LENSES.find((l) => l === url.searchParams.get('lens'));
    if (!lens) return refuse(400, 'bad_query', 'lens');
    const level = GEO_LEVELS.find((l): l is GeoLevel => l === url.searchParams.get('level')) ?? 'district';
    const parent = one(url.searchParams.get('parent'));
    if (parent !== null && !isUuid(parent)) return refuse(400, 'bad_query', 'parent');
    const setting = await readLensSetting(d.resolver, storeId);
    if (!setting || !setting.lenses[lens]) return refuse(404, 'not_on', 'The Geography map lens is off.');

    const at = { storeId };
    const [timeZone, limits] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('costs.report', at)]);
    const today = ymdIn(d.now?.() ?? new Date(), timeZone);
    const { q } = parseReportQuery(Object.fromEntries(url.searchParams), today, limits);
    const days = { from: q.from, to: q.to };

    const parts = await riskParts(d.db, g.actor, storeId);
    const result = await geoRisk(d.db, storeId, days, {
      timeZone,
      level,
      parentAreaId: parent,
      minOrders: setting.minOrders,
      warnReturnPct: setting.warnReturnPct,
      topBandKey: await topRiskBand(d.resolver, storeId),
      parts,
    });
    return json({ ok: true, lens, ...result } satisfies LensApiResponse, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
