// S02 · PR 59 — the admin API of the Find My Size size report and its ease model. No admin screen in this PR (it is
// built on the new 14-section admin shell, Products → Size charts → "Size report"); these are the routes it calls.
// Same shape as the rest of the catalogue API: every route signs the person in (guardAdmin), checks the permission in
// the store it touches (`?storeId=`, default the mother store), then calls @extas/catalogue, which checks the
// permission again, scopes everything by store and writes the audit log.
//
//   GET   /api/admin/catalogue/size-report                    the report (?days, ?productLimit) · catalogue.read
//   POST  /api/admin/catalogue/size-report/link               tie answers to their order lines and exchanges
//                                                             (follow-up 153; {days?}) · catalogue.write
//   GET   /api/admin/catalogue/size-advice                    the trained versions (?garmentTypeId, ?includeArchived=1)
//   POST  /api/admin/catalogue/size-advice/train              {days?, garmentTypeId?, fitKey?} → switched-off versions
//                                                             · catalogue.sizeAdvice
//   POST  /api/admin/catalogue/size-advice/:id/active         {active: true|false} · catalogue.sizeAdvice
//
// Nothing here changes a size chart or shows a customer anything new: a version only takes effect while the owner has
// `catalogue.sizeAdvice.useTrainedEase` on, and then only for the garment type and fit it was trained for.
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { storeIdOf } from './catalogue-api';

type Perm = 'catalogue.read' | 'catalogue.write' | 'catalogue.sizeAdvice';

interface Ctx {
  deps: cat.CatalogueDeps;
  who: cat.Who;
  url: URL;
}

const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const num = (url: URL, k: string): number | undefined => {
  const raw = url.searchParams.get(k);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

async function handle(request: Request, deps: AdminDeps | null, permission: Perm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: { db: deps!.db, settings: deps!.resolver, now: deps!.now }, who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/admin/catalogue/size-report · POST …/size-report/link. */
export function sizeReportHandler(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  if (path.length > 1) return Promise.resolve(fail(404, 'not-found'));
  if (path[0] === 'link') {
    if (method(request) !== 'POST') return notAllowed();
    return handle(request, deps, 'catalogue.write', async (c) => {
      const b = await body(request);
      const days = b.days === undefined ? undefined : Number(b.days);
      if (days !== undefined && !(Number.isInteger(days) && days > 0)) return fail(400, 'INVALID_INPUT', ['days']);
      return { result: await cat.linkSizeAnswers(c.deps, c.who, days === undefined ? {} : { days }) };
    });
  }
  if (path.length) return Promise.resolve(fail(404, 'not-found'));
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'catalogue.read', async (c) => {
    const days = num(c.url, 'days');
    const productLimit = num(c.url, 'productLimit');
    if (days === -1 || productLimit === -1) return fail(400, 'INVALID_INPUT', [days === -1 ? 'days' : 'productLimit']);
    return { report: await cat.sizeReport(c.deps, c.who, { ...(days ? { days } : {}), ...(productLimit ? { productLimit } : {}) }) };
  });
}

/** GET /api/admin/catalogue/size-advice · POST …/train · POST …/:id/active. */
export function sizeAdviceHandler(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  const [a, b] = path;
  if (!a) {
    if (method(request) !== 'GET') return notAllowed();
    return handle(request, deps, 'catalogue.read', async (c) => {
      const garmentTypeId = c.url.searchParams.get('garmentTypeId');
      if (garmentTypeId !== null && !isUuid(garmentTypeId)) return fail(400, 'INVALID_INPUT', ['garmentTypeId']);
      return {
        models: await cat.listSizeAdviceModels(c.deps, c.who, {
          ...(garmentTypeId ? { garmentTypeId } : {}),
          includeArchived: ['1', 'true'].includes(c.url.searchParams.get('includeArchived') ?? ''),
        }),
      };
    });
  }
  if (a === 'train') {
    if (path.length > 1) return Promise.resolve(fail(404, 'not-found'));
    if (method(request) !== 'POST') return notAllowed();
    return handle(request, deps, 'catalogue.sizeAdvice', async (c) => ({ result: await cat.trainSizeAdvice(c.deps, c.who, (await body(request)) as cat.TrainInput) }));
  }
  if (!isUuid(a)) return Promise.resolve(fail(404, 'NOT_FOUND', ['id']));
  if (b !== 'active' || path.length > 2) return Promise.resolve(fail(404, 'not-found'));
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.sizeAdvice', async (c) => {
    const input = await body(request);
    if (typeof input.active !== 'boolean') return fail(400, 'INVALID_INPUT', ['active']);
    return { model: await cat.setSizeAdviceModelActive(c.deps, c.who, a, input.active) };
  });
}
