// S14 · PR 284, 285, 286 — the customers admin API (BACKEND-ARCHITECTURE §5.5, §9.10). Every route signs the person in
// (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/customers, which checks the permission again, masks the phone numbers for anyone without `customers.phone`
// and writes the audit log in the same transaction as a change. Answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details, data }`. One catch-all route (app/api/admin/customers/[[...path]]) hands every
// path to `customersRoute`. Customer data is personal: nothing here exports a list (exports are PR 299, with their own
// key), and opening a customer and copying or calling his number are logged ("Who looked at this customer").
//
//   GET   /api/admin/customers?view=&q=&source=&sort=&page=   PR 285: the Customers list, one row per person, with the
//                                                     count of each view (customers.read)
//   GET   /api/admin/customers/by-phone?phone=        the person a number belongs to, however it is written (customers.read)
//   GET   /api/admin/customers/:id                    the single view: his profiles, numbers, order counts and lifetime
//                                                     value; a merged profile answers with its survivor (customers.read)
//   GET   /api/admin/customers/:id/orders?page=       PR 286: every order over every profile and number, newest first,
//                                                     a page of the owner's size (customers.read)
//   GET   /api/admin/customers/:id/exchanges          PR 286: his exchanges (customers.read)
//   GET   /api/admin/customers/:id/support            PR 286: his conversations and tickets, empty until S22 (customers.read)
//   GET   /api/admin/customers/:id/looks              PR 286: "Who looked at this customer" (customers.read + audit.read)
//   POST  /api/admin/customers/:id/access             {action: phone.copy | phone.call} logged before the full number is
//                                                     used (customers.phone)
//   GET   /api/admin/customers/merge-suggestions      the pairs the owner's merge rules find (customers.read)
//   GET   /api/admin/customers/merge-preview?a=&b=    two profiles side by side for a person's own merge (customers.read)
//   GET   /api/admin/customers/merges?limit=          the decisions made, newest first (customers.read)
//   POST  /api/admin/customers/merge                  {survivorId, mergedId, signals?, note?} (Idempotency-Key) (customers.merge)
//   POST  /api/admin/customers/not-same               {aId, bId, signals?, note?} the pair is not suggested again (customers.merge)
//   POST  /api/admin/customers/merges/:id/undo        {note} a split, or a "not the same person" taken back (customers.merge)
//   GET   /api/admin/customers/:id/journey?page=      PR 288: the journey view, every touch newest first (customers.read;
//                                                     off as shipped)
//   GET   /api/admin/customers/settings               PR 288: Customer settings, the CRM switches (customers.read)
//   PUT   /api/admin/customers/settings               {key, value} one card saved (customers.settings; audited)
//   GET   /api/admin/customers/segments               PR 287: the saved segments and the built-in ones, counted live
//                                                     (customers.read)
//   PUT   /api/admin/customers/segments/settings      {enabled?, maxSegments?, maxConditions?, previewShown?} the page's
//                                                     settings card (customers.segments.write; audited)
//   GET   /api/admin/customers/segments/options       the builder's pickers: categories, districts, sizes, sources
//   POST  /api/admin/customers/segments/preview       {definition} the builder's live count and first people (customers.read)
//   POST  /api/admin/customers/segments               {name, definition} a new segment (customers.segments.write; audited)
//   GET   /api/admin/customers/segments/:id           one segment with its live count (customers.read)
//   POST  /api/admin/customers/segments/:id           {name, definition, version} a change (STALE in between; audited)
//   POST  /api/admin/customers/segments/:id/archive   {archived} archive or restore, never deleted (audited)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';

interface Ctx {
  deps: cu.CustomersDeps;
  who: cu.Who;
  key: string | undefined;
  url: URL;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The customers service's dependencies for one request. */
export const customersDeps = (deps: AdminDeps): cu.CustomersDeps => ({ db: deps.db, settings: deps.resolver, now: deps.now });

function customersFail(e: unknown): Response {
  if (cu.isCustomersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: cu.CustomersPermission, fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const key = request.headers.get('idempotency-key')?.trim() || undefined;
    return json({ ok: true, ...(await fn({ deps: customersDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, key, url })) }, { status });
  } catch (e) {
    return customersFail(e);
  }
}

/** The list's query parameters (anything else is ignored). */
const LIST_PARAMS = ['view', 'q', 'source', 'sort', 'page', 'segment'] as const;

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));
const badId = (field: string) => Promise.resolve(fail(404, 'NOT_FOUND', [field]));

/** Every customers admin route: `path` is what comes after /api/admin/customers. */
export async function customersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (!a) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'customers.read', async (x) => {
      const q = Object.fromEntries(LIST_PARAMS.filter((k) => x.url.searchParams.has(k)).map((k) => [k, x.url.searchParams.get(k) ?? '']));
      return { ...(await cu.customerList(x.deps, x.who, q)) };
    });
  }
  if (a === 'by-phone') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'customers.read', async (x) => ({ match: await cu.customerByPhone(x.deps, x.who, x.url.searchParams.get('phone') ?? '') }));
  }
  if (a === 'segments') return segmentsRoute(request, deps, m, path.slice(1));
  if (a === 'settings') {
    if (path.length > 1) return notFound();
    if (m === 'GET') return handle(request, deps, 'customers.read', async (x) => ({ screen: await cu.crmSettingsScreen(x.deps, x.who) }));
    if (m === 'PUT') return handle(request, deps, 'customers.settings', async (x) => ({ screen: await cu.saveCrmSetting(x.deps, x.who, await body(request)) }));
    return notAllowed();
  }
  if (a === 'merge-suggestions') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'customers.read', async (x) => ({ ...(await cu.mergeSuggestions(x.deps, x.who)) }));
  }
  if (a === 'merge-preview') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'customers.read', async (x) => {
      const pair = await cu.mergePreview(x.deps, x.who, x.url.searchParams.get('a') ?? '', x.url.searchParams.get('b') ?? '');
      if (!pair) throw new cu.CustomersError('NOT_FOUND', 'no such pair', ['a', 'b']);
      return { pair };
    });
  }
  if (a === 'merge') {
    if (path.length > 1) return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'customers.merge', async (x) => ({ result: await cu.mergeCustomers(x.deps, x.who, await body(request), { idempotencyKey: x.key }) }), 201);
  }
  if (a === 'not-same') {
    if (path.length > 1) return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'customers.merge', async (x) => ({ result: await cu.notSamePerson(x.deps, x.who, await body(request)) }), 201);
  }
  if (a === 'merges') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'customers.read', async (x) => ({ rows: await cu.mergeDecisions(x.deps, x.who, x.url.searchParams.has('limit') ? { limit: Number(x.url.searchParams.get('limit')) } : {}) }));
    }
    if (path.length !== 3 || c !== 'undo') return notFound();
    if (!isUuid(b)) return badId('decisionId');
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'customers.merge', async (x) => ({ result: await cu.undoDecision(x.deps, x.who, b, await body(request)) }));
  }
  if (a && isUuid(a)) {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'customers.read', async (x) => {
        const view = await cu.customerView(x.deps, x.who, a);
        if (!view) throw new cu.CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
        return { customer: view };
      });
    }
    if (path.length === 2 && (b === 'orders' || b === 'exchanges' || b === 'support' || b === 'looks' || b === 'journey')) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'customers.read', async (x) => {
        if (b === 'orders') return { ...(await cu.customerOrders(x.deps, x.who, a, x.url.searchParams.has('page') ? { page: Number(x.url.searchParams.get('page')) } : {})) };
        if (b === 'exchanges') return { rows: await cu.customerExchanges(x.deps, x.who, a) };
        if (b === 'support') return { rows: await cu.customerSupport(x.deps, x.who, a) };
        if (b === 'journey') return { journey: await cu.customerJourney(x.deps, x.who, a, x.url.searchParams.has('page') ? { page: Number(x.url.searchParams.get('page')) } : {}) };
        return { rows: await cu.customerLooks(x.deps, x.who, a) };
      });
    }
    if (b === 'access' && path.length === 2) {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'customers.phone', async (x) => ({ ...(await cu.recordPhoneAccess(x.deps, x.who, a, await body(request))) }), 201);
    }
    return notFound();
  }
  if (a) return badId('customerId');
  return notFound();
}

/** PR 287 — the segments' routes (`path` after /segments). */
function segmentsRoute(request: Request, deps: AdminDeps | null, m: string, path: string[]): Promise<Response> {
  const [id, sub] = path;
  if (!id) {
    if (m === 'GET') return handle(request, deps, 'customers.read', async (x) => ({ screen: await cu.segmentsScreen(x.deps, x.who) }));
    if (m === 'POST') return handle(request, deps, 'customers.segments.write', async (x) => ({ segment: await cu.saveSegment(x.deps, x.who, null, await body(request)) }), 201);
    return notAllowed();
  }
  if (path.length > 2) return notFound();
  if (id === 'settings' && !sub) return m === 'PUT' ? handle(request, deps, 'customers.segments.write', async (x) => ({ screen: await cu.saveSegmentSettings(x.deps, x.who, await body(request)) })) : notAllowed();
  if (id === 'options' && !sub) return m === 'GET' ? handle(request, deps, 'customers.read', async (x) => ({ options: await cu.segmentOptions(x.deps, x.who) })) : notAllowed();
  if (id === 'preview' && !sub) return m === 'POST' ? handle(request, deps, 'customers.read', async (x) => ({ preview: await cu.previewSegment(x.deps, x.who, await body(request)) })) : notAllowed();
  if (!isUuid(id)) return badId('segmentId');
  if (!sub) {
    if (m === 'GET')
      return handle(request, deps, 'customers.read', async (x) => {
        const page = await cu.segmentPage(x.deps, x.who, id);
        if (!page) throw new cu.CustomersError('NOT_FOUND', 'no such segment', ['segmentId']);
        return { segment: page };
      });
    if (m === 'POST') return handle(request, deps, 'customers.segments.write', async (x) => ({ segment: await cu.saveSegment(x.deps, x.who, id, await body(request)) }));
    return notAllowed();
  }
  if (sub === 'archive') return m === 'POST' ? handle(request, deps, 'customers.segments.write', async (x) => ({ result: await cu.archiveSegment(x.deps, x.who, id, await body(request)) })) : notAllowed();
  return notFound();
}
