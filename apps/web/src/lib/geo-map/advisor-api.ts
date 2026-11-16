// S29 · PR 761 (CN-054) — the Geography map advisor as JSON (advice only):
//   GET  /api/admin/reports/geo-map/advisor?storeId=            where the advisor stands and the drafts waiting (no AI call)
//   POST /api/admin/reports/geo-map/advisor?from=&to=&period=&lang=en|bn&storeId=   one run: drafts into the approval queue
// Rules checked here on the server:
//   - `reports.read` for both; a POST also needs `ai.control` (the AI Control room's own permission), because it spends AI;
//   - the gates `reports.geoMap.on`, `reports.geoMap.ai` and `ai.enabled`, all off as shipped: a closed gate answers `not_on`
//     with which one, makes no AI call and no draft;
//   - the run only reads what the person who pressed the button may see (each lens part has its permission, as in lens-api.ts);
//   - the only write is a draft in the approval queue (kind `geo.advice`), never a setting, order, price, charge, COD rule,
//     courier, ad or stock. A draft's approval changes nothing either.
import { can } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { parseReportQuery } from '../cost-report';
import { advisorStatus, pendingAdvice, runGeoAdvisor, type AdvisorRun, type AdvisorStatus } from './advisor';

export type AdvisorApiResponse =
  | {
      ok: true;
      status: AdvisorStatus;
      drafts: Awaited<ReturnType<typeof pendingAdvice>>;
      run: AdvisorRun | null;
    }
  | {
      ok: false;
      error: 'not_on' | 'forbidden';
      status: AdvisorStatus;
      message: string;
    };

export async function geoAdvisorRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, {
    permission: 'reports.read',
    storeId,
  });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const status = await advisorStatus(d.resolver, storeId);
    if (status === 'off' || status === 'advisorOff') {
      return json(
        {
          ok: false,
          error: 'not_on',
          status,
          message: 'The Geography map advisor is off.',
        } satisfies AdvisorApiResponse,
        { status: 404 },
      );
    }
    if (method === 'GET') {
      const drafts = await pendingAdvice(d.db, storeId);
      return json({ ok: true, status, drafts, run: null } satisfies AdvisorApiResponse, { headers: { 'cache-control': 'no-store' } });
    }
    if (!(await can(d.db, g.actor, 'ai.control', { storeId }))) {
      return json(
        {
          ok: false,
          error: 'forbidden',
          status,
          message: 'Running the advisor needs the AI control permission.',
        } satisfies AdvisorApiResponse,
        { status: 403 },
      );
    }
    if (status === 'aiOff') {
      // AI is off: no call, no draft
      return json(
        {
          ok: false,
          error: 'not_on',
          status,
          message: 'AI is off.',
        } satisfies AdvisorApiResponse,
        { status: 409 },
      );
    }
    const at = { storeId };
    const [timeZone, limits] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('costs.report', at)]);
    const today = ymdIn(d.now?.() ?? new Date(), timeZone);
    const { q } = parseReportQuery(Object.fromEntries(url.searchParams), today, limits);
    const lang = url.searchParams.get('lang') === 'bn' ? 'bn' : 'en';
    const run = await runGeoAdvisor({ db: d.db, resolver: d.resolver, vault: d.vault, now: d.now }, storeId, {
      actor: g.actor,
      lang,
      days: { from: q.from, to: q.to },
    });
    const drafts = await pendingAdvice(d.db, storeId);
    return json(
      {
        ok: true,
        status: run.status,
        drafts,
        run,
      } satisfies AdvisorApiResponse,
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
