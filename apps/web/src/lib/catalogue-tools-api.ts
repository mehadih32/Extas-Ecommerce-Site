// S01 · PR 33, 36, 39 — the admin API of the catalogue tools, plus the public back-in-stock form. Same door as the rest
// of the catalogue API (catalogue-api.ts `handle`: guardAdmin with the permission in `?storeId=`); @extas/catalogue
// checks every permission again.
//
//   GET         /api/admin/catalogue/link-import                 the import screen: switched on, reader mode, latest reads
//   POST        /api/admin/catalogue/link-import                 {action: 'preview', url} | {action: 'draft', jobId, edits}
//   GET         /api/admin/catalogue/back-in-stock               waiting requests per product (counts only)
//   GET/POST    /api/admin/catalogue/back-in-stock/requests      the requests with contacts (?productId, state, page) ·
//                                                                {action: 'told'|'archive'|'restore', ids} — catalogue.interest
//   GET         /api/admin/catalogue/audit                       the product audit report (?check, status, page, recheckSince)
//   POST        /api/back-in-stock                               public: "tell me when it is back" {productId, variantId?, phone | email}
//
// The page reader is looked up through the connection layer (PR 18): the store's or the installation's "page reader"
// connection when it is switched on in Keys & connections, else its mock (A1.3).
import { createConnections, pageReaderAdapters, type PageReader } from '@extas/adapters';
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, isUuid, json, sameOrigin, type AdminDeps } from './admin-auth';
import { handle, storeIdOf } from './catalogue-api';
import { sellableReader } from './shop/sellable';

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const method = (r: Request) => r.method.toUpperCase();
const num = (v: string | null) => (v === null || v === '' ? undefined : Number(v));
const str = (v: string | null) => (v === null || v === '' ? undefined : v);

type Connections = ReturnType<typeof createConnections>;
const holder = globalThis as unknown as { __pageReaderConnections?: { db: unknown; c: Connections } };

/** The page reader for a store, through the connection layer (cached like every connection). */
export async function pageReaderFor(deps: AdminDeps, storeId: number): Promise<cat.PageReaderConnection> {
  if (holder.__pageReaderConnections?.db !== deps.db) {
    const [cacheSeconds, testSeconds] = await Promise.all([deps.resolver.value('system.integrationKeyCacheSeconds'), deps.resolver.value('system.integrationTestTimeoutSeconds')]);
    holder.__pageReaderConnections = {
      db: deps.db,
      c: createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: pageReaderAdapters, secretCacheMs: cacheSeconds * 1000, testTimeoutMs: testSeconds * 1000 }),
    };
  }
  const r = await holder.__pageReaderConnections.c.use<PageReader>('OTHER', { storeId, provider: 'pageReader' });
  return { api: r.api, mode: r.mode, provider: r.provider };
}

const toolDeps = (deps: AdminDeps, base: cat.CatalogueDeps): cat.LinkImportDeps => ({ ...base, pageReader: (storeId) => pageReaderFor(deps, storeId) });

/** GET — the import screen's data. POST {action: 'preview', url} | {action: 'draft', jobId, edits}. */
export function linkImportHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.import', async (c) => ({ view: await cat.linkImportView(toolDeps(deps!, c.deps), c.who, { page: num(c.url.searchParams.get('page')) }) }));
  }
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.import', async (c) => {
    const b = await body(request);
    if (b.action === 'preview') return { preview: await cat.previewLinkImport(toolDeps(deps!, c.deps), c.who, { url: typeof b.url === 'string' ? b.url : '' }) };
    if (b.action === 'draft') {
      if (!isUuid(b.jobId)) return fail(400, 'INVALID_INPUT', ['jobId']);
      return { draft: await cat.createDraftFromImport(c.deps, c.who, b.jobId, (b.edits ?? {}) as cat.LinkDraftInput) };
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  });
}

/** GET ?page= — waiting requests per product (no contacts). */
export function backInStockHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'catalogue.read', async (c) => ({ summary: await cat.backInStockSummary(c.deps, c.who, { page: num(c.url.searchParams.get('page')) }) }));
}

/** GET ?productId&state&page — the requests with contacts. POST {action, ids} — mark them. Both need catalogue.interest. */
export function backInStockRequestsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) === 'GET') {
    return handle(request, deps, 'catalogue.interest', async (c) => {
      const p = c.url.searchParams;
      return { requests: await cat.backInStockRequests(c.deps, c.who, { productId: str(p.get('productId')), state: str(p.get('state')) as cat.InterestState | undefined, page: num(p.get('page')) }) };
    });
  }
  if (method(request) !== 'POST') return notAllowed();
  return handle(request, deps, 'catalogue.interest', async (c) => ({ result: await cat.updateInterest(c.deps, c.who, (await body(request)) as cat.InterestUpdate) }));
}

/** GET ?check&status&page&recheckSince — the product audit report. */
export function productAuditHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'GET') return notAllowed();
  return handle(request, deps, 'catalogue.read', async (c) => {
    const p = c.url.searchParams;
    return {
      audit: await cat.productAudit(c.deps, c.who, {
        check: str(p.get('check')) as cat.PublishCheckKey | undefined,
        status: str(p.get('status')) as cat.AuditStatus | undefined,
        page: num(p.get('page')),
        recheckSince: str(p.get('recheckSince')),
      }),
    };
  });
}

/** The public form's body is small: anything far larger is refused before it is read. */
const PUBLIC_BODY_MAX = 4096;

/** POST /api/back-in-stock {productId, variantId?, phone | email} — public; the answer never repeats the contact. */
export async function publicBackInStockHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (method(request) !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > PUBLIC_BODY_MAX) return fail(413, 'TOO_LARGE');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  try {
    const b = await body(request);
    const input = { productId: b.productId, variantId: b.variantId ?? undefined, phone: b.phone || undefined, email: b.email || undefined } as cat.InterestInput;
    // PR 71 (follow-up 63): the request is judged on the sellable stock the page shows, not on the in-stock flag alone
    const sellable = sellableReader(deps.db, deps.resolver, storeId);
    const r = await cat.registerInterest({ db: deps.db, settings: deps.resolver, now: deps.now, sellable }, storeId, input);
    return json({ ok: true, created: r.created }, { status: r.created ? 201 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
